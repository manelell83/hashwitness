import { createHash, randomUUID } from "node:crypto";
import { fetchTopicMessages, type FetchOptions } from "./mirror.ts";
import { credentialStatus, type CredentialStatus } from "./registry.ts";
import { verifyChain, type ChainResult } from "./runningHash.ts";
import type { MirrorConfig, TopicMessage } from "./types.ts";

export type Verdict = "VALID" | "REVOKED" | "NOT_FOUND" | "INCONSISTENT" | "UNREACHABLE";

/** Topic head read directly from a consensus node (TopicInfoQuery); independent of every mirror. */
export interface Anchor {
  sequence: number;
  runningHash: string; // base64
}

export type MirrorState =
  | "agree" //        complete, valid chain, consistent with anchor and with the quorum
  | "stale" //        valid chain but missing the latest messages (replay or lag that outlived the retry)
  | "forged" //       chain conflicts with the anchor or with the majority view at some sequence number
  | "broken_chain" // running-hash chain does not verify
  | "split_view" //   answered a second, anonymous client differently (equivocation)
  | "unreachable";

export interface MirrorReport {
  mirror: string;
  state: MirrorState;
  latencyMs: number | null;
  digest: string | null; // SHA-256 over (sequence, running_hash, consensus_timestamp, message) of all messages
  lastSequence: number | null;
  credentialStatus: CredentialStatus | null; // what an app trusting only this mirror would conclude
  splitViewStatus: CredentialStatus | null; // equivocation: the status shown to an anonymous client
  error?: string;
}

export interface DiffEntry {
  sequence: number;
  kind: "missing" | "altered" | "extra";
  /** per mirror: running hash at this sequence, or null when the mirror does not return it */
  byMirror: Record<string, string | null>;
  expected: string | null; // reference running hash (anchor-consistent majority view)
}

export interface VerificationResult {
  verdict: Verdict;
  topicId: string;
  credentialId: string;
  quorum: { k: number; n: number; agreeing: number };
  anchor: Anchor | null;
  credentialHash: string | null;
  mirrors: MirrorReport[];
  disagreeing: string[];
  diff: DiffEntry[];
  /** SHA-256 of the reference view; published in the HCS attestation */
  digest: string | null;
}

export interface VerifyInput {
  topicId: string;
  credentialId: string;
  issuer: string;
  mirrors: MirrorConfig[];
  k: number;
  anchor?: Anchor | null;
  /** Re-query a second time as an anonymous client and compare (detects equivocation). */
  probeSplitView?: boolean;
  /** Wait before re-fetching mirrors that are behind the head (absorbs normal mirror lag). */
  lagRetryMs?: number;
  fetch?: FetchOptions;
}

/** Header that identifies the verifier to a mirror. A split-view probe uses a random value instead. */
export const CLIENT_HEADER = "x-hw-client";

export function viewDigest(messages: TopicMessage[]): string {
  const h = createHash("sha256");
  for (const m of messages) h.update(`${m.sequenceNumber}|${m.runningHash}|${m.consensusTimestamp}|${m.message}\n`);
  return h.digest("hex");
}

interface Observation {
  mirror: MirrorConfig;
  messages: TopicMessage[] | null;
  latencyMs: number | null;
  chain: ChainResult | null;
  error?: string;
  probeDigest?: string | null; // digest seen by the anonymous probe, if probed
  probeMessages?: TopicMessage[] | null;
}

/** The view an anonymous client received, when it differs from the verifier's (equivocation). */
const splitView = (o: Observation): TopicMessage[] | null =>
  o.probeMessages && o.probeDigest && o.messages && o.probeDigest !== viewDigest(o.messages) ? o.probeMessages : null;

async function observe(mirror: MirrorConfig, input: VerifyInput, clientId: string): Promise<Observation> {
  const m = { ...mirror, headers: { ...mirror.headers, [CLIENT_HEADER]: clientId } };
  try {
    const r = await fetchTopicMessages(m, input.topicId, input.fetch);
    return { mirror, messages: r.messages, latencyMs: r.latencyMs, chain: verifyChain(r.messages) };
  } catch (e) {
    return { mirror, messages: null, latencyMs: null, chain: null, error: (e as Error).message };
  }
}

const headSeq = (o: Observation) => (o.chain?.ok ? o.chain.lastSequence : -1);

/**
 * Quorum verification. Deterministic: same observations in, same result out. No LLM involved.
 * A credential verdict (VALID/REVOKED/NOT_FOUND) needs at least k mirrors that fully agree:
 * identical complete views, valid running-hash chains, and (when given) ending at the anchor.
 */
export async function verifyCredential(input: VerifyInput): Promise<VerificationResult> {
  const { mirrors, k, anchor = null } = input;
  if (k < 1 || k > mirrors.length) throw new Error(`invalid quorum ${k}-of-${mirrors.length}`);

  let obs = await Promise.all(mirrors.map((m) => observe(m, input, "hashwitness")));

  // Retry once for mirrors behind the head: a just-submitted message reaches mirrors a few seconds late.
  const head = Math.max(anchor?.sequence ?? -1, ...obs.map(headSeq));
  const behind = obs.filter((o) => o.chain?.ok && headSeq(o) < head);
  if (behind.length > 0 && (input.lagRetryMs ?? 1500) > 0) {
    await new Promise((r) => setTimeout(r, input.lagRetryMs ?? 1500));
    const again = await Promise.all(behind.map((o) => observe(o.mirror, input, "hashwitness")));
    obs = obs.map((o) => again.find((a) => a.mirror.name === o.mirror.name) ?? o);
  }

  if (input.probeSplitView) {
    const probes = await Promise.all(obs.map((o) => (o.messages ? observe(o.mirror, input, `anon-${randomUUID()}`) : null)));
    obs = obs.map((o, i) => ({
      ...o,
      probeDigest: probes[i]?.messages ? viewDigest(probes[i]!.messages!) : null,
      probeMessages: probes[i]?.messages ?? null,
    }));
  }

  // Reference view: among valid chains that are consistent with the anchor, the digest shared by most mirrors.
  const consistentWithAnchor = (o: Observation): boolean => {
    if (!anchor || !o.messages) return true;
    const atAnchor = o.messages.find((m) => m.sequenceNumber === anchor.sequence);
    return atAnchor ? atAnchor.runningHash === anchor.runningHash : true; // shorter view: judged as stale below
  };
  // With an anchor, only a view that reaches the anchor can be the reference. Without one, the
  // largest group of identical views wins (a lone liar cannot win by appending forged messages).
  const candidates = obs.filter(
    (o) => o.chain?.ok && consistentWithAnchor(o) && (!anchor || headSeq(o) >= anchor.sequence),
  );
  const counts = new Map<string, Observation[]>();
  for (const o of candidates) {
    const d = viewDigest(o.messages!);
    counts.set(d, [...(counts.get(d) ?? []), o]);
  }
  const groups = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
  // A tie between two different complete views means nobody can tell which one is true.
  const tie = groups.length > 1 && groups[0]![1].length === groups[1]![1].length;
  const reference = !tie && groups[0] ? groups[0][1][0]!.messages! : null;
  const refDigest = reference ? viewDigest(reference) : null;
  const refBySeq = new Map((reference ?? []).map((m) => [m.sequenceNumber, m.runningHash]));

  const reports: MirrorReport[] = obs.map((o) => {
    const base = {
      mirror: o.mirror.name,
      latencyMs: o.latencyMs,
      digest: o.messages ? viewDigest(o.messages) : null,
      lastSequence: o.messages ? (o.messages.at(-1)?.sequenceNumber ?? 0) : null,
      credentialStatus: o.messages ? credentialStatus(o.messages, input.credentialId, input.issuer).status : null,
      // On a split view, what the OTHER clients are told (that is what a naive app would see).
      splitViewStatus: splitView(o) ? credentialStatus(splitView(o)!, input.credentialId, input.issuer).status : null,
    };
    let state: MirrorState;
    if (!o.messages) state = "unreachable";
    else if (!o.chain?.ok) state = "broken_chain";
    else if (o.probeDigest && o.probeDigest !== base.digest) state = "split_view";
    else if (!consistentWithAnchor(o) || o.messages.some((m) => refBySeq.has(m.sequenceNumber) && refBySeq.get(m.sequenceNumber) !== m.runningHash)) state = "forged";
    else if (refDigest && base.digest === refDigest) state = "agree";
    else if (reference && headSeq(o) < reference.length) state = "stale"; // valid prefix of the reference
    else state = "forged"; // complete view that differs from the reference, or no reference at all
    return o.error ? { ...base, state, error: o.error } : { ...base, state };
  });

  const reachable = reports.filter((r) => r.state !== "unreachable").length;
  const agreeing = reports.filter((r) => r.state === "agree").length;

  let verdict: Verdict;
  let credentialHash: string | null = null;
  if (reachable < k) verdict = "UNREACHABLE";
  else if (agreeing < k || !reference) verdict = "INCONSISTENT";
  else {
    const s = credentialStatus(reference, input.credentialId, input.issuer);
    credentialHash = s.credentialHash;
    verdict = s.status === "ISSUED" ? "VALID" : s.status === "REVOKED" ? "REVOKED" : "NOT_FOUND";
  }

  return {
    verdict,
    topicId: input.topicId,
    credentialId: input.credentialId,
    quorum: { k, n: mirrors.length, agreeing },
    anchor,
    credentialHash,
    mirrors: reports,
    disagreeing: reports.filter((r) => r.state !== "agree" && r.state !== "unreachable").map((r) => r.mirror),
    diff: buildDiff(obs, reference),
    digest: refDigest,
  };
}

function buildDiff(obs: Observation[], reference: TopicMessage[] | null): DiffEntry[] {
  const views: { mirror: { name: string }; messages: TopicMessage[] | null }[] = obs.filter((o) => o.messages);
  for (const o of obs) {
    const sv = splitView(o);
    if (sv) views.push({ mirror: { name: `${o.mirror.name} (to other clients)` }, messages: sv });
  }
  const ref = new Map((reference ?? []).map((m) => [m.sequenceNumber, m.runningHash]));
  const seqs = new Set<number>(ref.keys());
  for (const o of views) for (const m of o.messages!) seqs.add(m.sequenceNumber);
  const diff: DiffEntry[] = [];
  for (const seq of [...seqs].sort((a, b) => a - b)) {
    const byMirror: Record<string, string | null> = {};
    for (const o of views) byMirror[o.mirror.name] = o.messages!.find((m) => m.sequenceNumber === seq)?.runningHash ?? null;
    const values = Object.values(byMirror);
    const expected = ref.get(seq) ?? null;
    if (values.every((v) => v === expected)) continue;
    const kind = expected === null ? "extra" : values.some((v) => v !== null && v !== expected) ? "altered" : "missing";
    diff.push({ sequence: seq, kind, byMirror, expected });
  }
  return diff;
}
