import { existsSync, readFileSync } from "node:fs";
import {
  auditEntries, credentialStatus, fetchTopicMessages, reportHash, verifyChain, verifyCredential, CLIENT_HEADER, type Report,
} from "@hashwitness/core";
import { isMetricsReport } from "@hashwitness/sim";
import { anchorFor, cacheFetch, env, FAKE_MIRROR, MIRROR_CACHE_DIR, publishAttestation, realMirrors, REPORTS_DIR } from "@hashwitness/scripts/lib";
import { cacheSavedAt, isOffline } from "@hashwitness/core/mirror-cache";
import { agentConfigFromEnv, analyze } from "@hashwitness/agent";
import { createApi } from "./app.ts";

const agentCfg = agentConfigFromEnv(new URL("../../../", import.meta.url));

const port = Number(process.env.API_PORT ?? 5552);
const registryTopic = env("REGISTRY_TOPIC_ID");
const issuer = env("OPERATOR_ID");
const real = realMirrors();
// With the consensus-node anchor, a mirror whose full view ends at the anchor hash is proven correct
// (SHA-384 chain), so k only governs availability. Default: majority of the REAL mirrors.
// DESIGN: confirm the default quorum you want to present (override with QUORUM_K).
const offline = isOffline();
const fetchOpts = { fetchImpl: cacheFetch };
const k = Number(process.env.QUORUM_K ?? Math.floor(real.length / 2) + 1);

const app = createApi({
  config: () => ({
    mirrors: real.map((m) => m.name), attackerMirror: FAKE_MIRROR.name, k,
    registryTopic, attestationTopic: env("ATTESTATION_TOPIC_ID"),
    offline: offline ? { savedAt: cacheSavedAt(MIRROR_CACHE_DIR) } : null,
  }),

  async verify(credentialId, { includeAttacker }) {
    const mirrors = includeAttacker ? [...real, FAKE_MIRROR] : real;
    const anchor = await anchorFor(registryTopic);
    const result = await verifyCredential({
      topicId: registryTopic, credentialId, issuer, mirrors, k: Math.min(k, mirrors.length), anchor, probeSplitView: true, fetch: fetchOpts,
    });
    // The verdict is final here. The agent only adds an explanation, which is hashed into the report.
    const forensic = await analyze(result, agentCfg);
    // Offline: nothing can reach Hedera, so nothing is published (the UI says so). Never faked.
    if (offline) return { result, forensic, attestation: null };
    const p = await publishAttestation({ v: 1, verification: result, forensic });
    return { result, forensic, attestation: { sequence: p.sequence, reportHash: p.attestation.reportHash, transactionUrl: p.transactionUrl } };
  },

  async naive(credentialId, which) {
    const base = which === "public" ? real[0]! : FAKE_MIRROR;
    const mirror = { ...base, headers: { ...base.headers, [CLIENT_HEADER]: "naive-app" } };
    const r = await fetchTopicMessages(mirror, registryTopic, fetchOpts);
    return {
      mirror: base.name,
      status: credentialStatus(r.messages, credentialId, issuer).status,
      lastSequence: r.messages.at(-1)?.sequenceNumber ?? 0,
      latencyMs: r.latencyMs,
    };
  },

  async audit() {
    const topicId = env("ATTESTATION_TOPIC_ID");
    const { messages } = await fetchTopicMessages(real[0]!, topicId, fetchOpts);
    return {
      topicId,
      chainValid: verifyChain(messages).ok,
      entries: auditEntries(messages, issuer).slice(0, 50).map((e) => {
        const file = new URL(`${e.attestation.reportHash}.json`, REPORTS_DIR);
        const reportCheck = !existsSync(file)
          ? ("not_stored" as const)
          : reportHash(JSON.parse(readFileSync(file, "utf8")) as Report) === e.attestation.reportHash ? ("match" as const) : ("edited" as const);
        return {
          sequence: e.sequence, consensusTimestamp: e.consensusTimestamp, attestation: e.attestation, reportCheck,
          explorerUrl: `https://hashscan.io/testnet/transaction/${e.consensusTimestamp}`,
        };
      }),
    };
  },

  async metrics() {
    const file = new URL("../../../.data/sim/metrics.json", import.meta.url);
    if (!existsSync(file)) return null;
    const m: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isMetricsReport(m)) throw new Error("metrics.json has an unexpected shape");
    return m;
  },

  async getAttackMode() {
    return (await fetch(`${FAKE_MIRROR.baseUrl}/admin/mode`, { signal: AbortSignal.timeout(3000) })).json();
  },

  async setAttackMode(body) {
    const r = await fetch(`${FAKE_MIRROR.baseUrl}/admin/mode`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
    });
    return { status: r.status, body: await r.json() };
  },
});

app.listen(port, "127.0.0.1", (err?: Error) => {
  if (err) {
    console.error(`api could not listen on ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`api on http://127.0.0.1:${port}  mirrors: ${real.map((m) => m.name).join(", ")} (+ attacker)  k=${k}`);
  const llm = agentCfg.demoReplay ? "DEMO_REPLAY (recordings, no network)" : agentCfg.apiKey && agentCfg.model ? `LLM ${agentCfg.model}` : "rule-based fallback (no LLM configured)";
  console.log(`forensic agent: ${llm}`);
  if (offline) console.log(`OFFLINE demo: mirror responses and consensus anchor replayed from cache (saved ${cacheSavedAt(MIRROR_CACHE_DIR) ?? "never"}); attestations are not published`);
});
