// Simulated world: a pool of mirrors with assumed reliability and cost, and scenarios with ground truth.
// The verifier and the attack transforms are the REAL ones (core.verifyCredential, fake-mirror.applyAttack).
// Everything in SimConfig is an ASSUMPTION of the simulation, exported with the results.
import type { TopicMessage } from "@hashwitness/core";
import { applyAttack, DEFAULT_CONFIG, rechain, type AttackMode } from "@hashwitness/fake-mirror";
import type { AttackLabel } from "./metrics.ts";

/** Seeded PRNG (mulberry32). Deterministic: same seed, same scenarios, same results. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MirrorSpec {
  name: string;
  cost: number; // cost units per query (e.g. paid tier / rate-limit pressure)
  pUnreachable: number; // per verification
  pLag: number; // per verification: serves a view missing the newest message (benign)
}

export interface SimConfig {
  seed: number;
  scenarios: number;
  mirrors: MirrorSpec[];
  pAttack: number; // probability that a scenario is attacked
  attackers: { mirror: string; weight: number }[]; // who is compromised when an attack happens
  quorumK: number; // agreeing mirrors required (both strategies)
  bandit: { probeRate: number; auditRate: number; prior: [number, number] };
}

export const DEFAULT_SIM: SimConfig = {
  seed: 42,
  scenarios: 200,
  mirrors: [
    { name: "mirror-a", cost: 1, pUnreachable: 0.02, pLag: 0.04 },
    { name: "mirror-b", cost: 1, pUnreachable: 0.1, pLag: 0.1 },
    { name: "mirror-c", cost: 2, pUnreachable: 0.01, pLag: 0.02 },
    { name: "mirror-d", cost: 2, pUnreachable: 0.03, pLag: 0.03 },
    { name: "mirror-e", cost: 1, pUnreachable: 0.02, pLag: 0.04 },
  ],
  pAttack: 0.35,
  attackers: [{ mirror: "mirror-e", weight: 0.7 }, { mirror: "mirror-b", weight: 0.3 }],
  quorumK: 2,
  bandit: { probeRate: 0.25, auditRate: 0.1, prior: [1, 1] },
};

export const ISSUER = "0.0.1001";
export const TOPIC = "0.0.5000";
export const TARGET = "DIP-001"; // revoked at seq 3: the attacks try to make it look valid

const ev = (type: "issue" | "revoke", credentialId: string) => ({
  type, credentialId, credentialHash: "0".repeat(63) + credentialId.at(-1), issuer: ISSUER, ts: "2026-11-13T10:00:00Z",
});

/** Same shape as the testnet registry: issue DIP-001, issue DIP-002, revoke DIP-001, issue DIP-003. */
export function registry(): TopicMessage[] {
  const bodies = [ev("issue", "DIP-001"), ev("issue", "DIP-002"), ev("revoke", "DIP-001"), ev("issue", "DIP-003")];
  return rechain(bodies.map((b, i) => ({
    topicId: TOPIC, sequenceNumber: i + 1, consensusTimestamp: `17000000${String(i).padStart(2, "0")}.000000000`,
    payerAccountId: ISSUER, runningHash: "", runningHashVersion: 3, message: Buffer.from(JSON.stringify(b)).toString("base64"),
  })));
}

export type Behaviour = "honest" | "unreachable" | "lag" | "tamper" | "replay" | "equivocate";

export interface Scenario {
  id: number;
  truth: AttackLabel; // ground truth label
  attacker: string | null;
  behaviour: Record<string, Behaviour>;
}

const ATTACK_MODES: AttackMode[] = ["tamper", "replay", "equivocate"];
const LABEL: Record<string, AttackLabel> = { tamper: "tamper", replay: "replay", equivocate: "equivocation" };

export function makeScenarios(cfg: SimConfig): Scenario[] {
  const r = rng(cfg.seed);
  const pick = <T,>(xs: { v: T; w: number }[]): T => {
    let u = r() * xs.reduce((a, x) => a + x.w, 0);
    for (const x of xs) if ((u -= x.w) <= 0) return x.v;
    return xs.at(-1)!.v;
  };
  return Array.from({ length: cfg.scenarios }, (_, id) => {
    const behaviour: Record<string, Behaviour> = {};
    for (const m of cfg.mirrors) behaviour[m.name] = r() < m.pUnreachable ? "unreachable" : r() < m.pLag ? "lag" : "honest";
    if (r() < cfg.pAttack) {
      const attacker = pick(cfg.attackers.map((a) => ({ v: a.mirror, w: a.weight })));
      const mode = ATTACK_MODES[Math.floor(r() * ATTACK_MODES.length)]!;
      behaviour[attacker] = mode as Behaviour; // an attacking mirror is reachable and answers
      return { id: id + 1, truth: LABEL[mode]!, attacker, behaviour };
    }
    return { id: id + 1, truth: "benign_fault" as AttackLabel, attacker: null, behaviour };
  });
}

/** The view a mirror serves in a scenario, to the verifier ("main") or to an anonymous probe. */
export function viewOf(b: Behaviour, kind: "main" | "probe"): TopicMessage[] | "down" {
  const reg = registry();
  switch (b) {
    case "honest": return reg;
    case "unreachable": return "down";
    case "lag": return reg.slice(0, -1);
    case "tamper": return applyAttack(reg, { ...DEFAULT_CONFIG, mode: "tamper" }, undefined).messages;
    case "replay": return applyAttack(reg, { ...DEFAULT_CONFIG, mode: "replay" }, undefined).messages;
    case "equivocate": return applyAttack(reg, { ...DEFAULT_CONFIG, mode: "equivocate" }, kind === "main" ? "hashwitness" : "anon").messages;
  }
}
