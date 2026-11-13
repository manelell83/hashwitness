// Two ways to choose which mirrors to query. Both use the real quorum verifier with a consensus anchor.
import { verifyCredential, type VerificationResult } from "@hashwitness/core";
import { ISSUER, TARGET, TOPIC, registry, rng, viewOf, type Scenario, type SimConfig } from "./world.ts";

export interface Outcome {
  result: VerificationResult;
  queried: string[]; // mirrors queried (main view)
  probed: string[]; // mirrors that also received an anonymous split-view probe
  queries: number;
  cost: number;
}

const toWire = (m: ReturnType<typeof registry>[number]) => ({
  consensus_timestamp: m.consensusTimestamp, message: m.message, payer_account_id: m.payerAccountId,
  running_hash: m.runningHash, running_hash_version: m.runningHashVersion, sequence_number: m.sequenceNumber, topic_id: m.topicId,
});

/**
 * One verification in a scenario. The fetch is in memory; each (mirror, main|probe) request is charged once,
 * even though the verifier is re-run as the bandit adds mirrors. A probe on a mirror not chosen for probing
 * returns the main view for free, i.e. it is as if no probe was sent.
 */
class Session {
  private charged = new Set<string>();
  queries = 0;
  cost = 0;
  readonly probed = new Set<string>();
  constructor(private s: Scenario, private cfg: SimConfig) {}

  fetch: typeof fetch = (async (input: URL | string, init?: RequestInit) => {
    const name = new URL(input.toString()).host.replace(/\.sim$/, "");
    const isMain = new Headers(init?.headers).get("x-hw-client") === "hashwitness";
    const kind = isMain || !this.probed.has(name) ? "main" : "probe";
    const key = `${name}|${kind}`;
    if (!this.charged.has(key)) {
      this.charged.add(key);
      this.queries++;
      this.cost += this.cfg.mirrors.find((m) => m.name === name)!.cost;
    }
    const view = viewOf(this.s.behaviour[name]!, kind);
    if (view === "down") throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ messages: view.map(toWire), links: { next: null } }));
  }) as typeof fetch;

  verify(names: string[]): Promise<VerificationResult> {
    const reg = registry();
    return verifyCredential({
      topicId: TOPIC, credentialId: TARGET, issuer: ISSUER,
      mirrors: names.map((n) => ({ name: n, baseUrl: `https://${n}.sim` })),
      k: Math.min(this.cfg.quorumK, names.length),
      anchor: { sequence: reg.length, runningHash: reg.at(-1)!.runningHash },
      probeSplitView: this.probed.size > 0,
      lagRetryMs: 0, // ASSUMPTION: lag persists for the whole verification (no catch-up during the retry window)
      fetch: { fetchImpl: this.fetch },
    });
  }
}

/** Baseline: query every mirror and probe every mirror, every time. */
export async function queryAll(s: Scenario, cfg: SimConfig): Promise<Outcome> {
  const session = new Session(s, cfg);
  const names = cfg.mirrors.map((m) => m.name);
  names.forEach((n) => session.probed.add(n));
  const result = await session.verify(names);
  return { result, queried: names, probed: names, queries: session.queries, cost: session.cost };
}

/**
 * Thompson sampling over mirrors. Posterior per mirror: Beta(successes, failures), success = the mirror's view
 * agreed with the anchored quorum. Mirrors are added one at a time by highest sampled reliability per unit cost,
 * until quorumK mirrors agree. With probability probeRate a queried mirror also gets a split-view probe, and with
 * probability auditRate one extra random mirror is audited, so a mirror the bandit avoids is still checked.
 */
export class ThompsonBandit {
  readonly alpha = new Map<string, number>();
  readonly beta = new Map<string, number>();
  private r: () => number;

  constructor(private cfg: SimConfig) {
    this.r = rng(cfg.seed ^ 0x5bd1e995);
    for (const m of cfg.mirrors) {
      this.alpha.set(m.name, cfg.bandit.prior[0]);
      this.beta.set(m.name, cfg.bandit.prior[1]);
    }
  }

  /** Beta(a, b) sample via two Gamma samples (Marsaglia–Tsang), using the seeded PRNG. */
  sampleBeta(a: number, b: number): number {
    const x = this.gamma(a);
    return x / (x + this.gamma(b));
  }
  private gamma(k: number): number {
    if (k < 1) return this.gamma(k + 1) * this.r() ** (1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number, v: number;
      do {
        const u1 = this.r() || 1e-12, u2 = this.r();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);
      v = v ** 3;
      const u = this.r();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  private next(exclude: Set<string>): string | null {
    let best: string | null = null, bestScore = -Infinity;
    for (const m of this.cfg.mirrors) {
      if (exclude.has(m.name)) continue;
      const score = this.sampleBeta(this.alpha.get(m.name)!, this.beta.get(m.name)!) / m.cost;
      if (score > bestScore) [best, bestScore] = [m.name, score];
    }
    return best;
  }

  async run(s: Scenario): Promise<Outcome> {
    const session = new Session(s, this.cfg);
    const chosen = new Set<string>();
    let result: VerificationResult | null = null;
    for (;;) {
      const n = this.next(chosen);
      if (n === null) break;
      chosen.add(n);
      if (this.r() < this.cfg.bandit.probeRate) session.probed.add(n);
      result = await session.verify([...chosen]);
      if (result.quorum.agreeing >= this.cfg.quorumK) break;
    }
    if (this.r() < this.cfg.bandit.auditRate) {
      const rest = this.cfg.mirrors.map((m) => m.name).filter((m) => !chosen.has(m));
      if (rest.length) {
        const audited = rest[Math.floor(this.r() * rest.length)]!;
        chosen.add(audited);
        session.probed.add(audited);
        result = await session.verify([...chosen]);
      }
    }
    for (const m of result!.mirrors) {
      if (m.state === "unreachable") this.beta.set(m.mirror, this.beta.get(m.mirror)! + 1);
      else if (m.state === "agree") this.alpha.set(m.mirror, this.alpha.get(m.mirror)! + 1);
      else this.beta.set(m.mirror, this.beta.get(m.mirror)! + 1);
    }
    return { result: result!, queried: [...chosen], probed: [...session.probed], queries: session.queries, cost: session.cost };
  }
}
