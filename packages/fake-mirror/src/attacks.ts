// Deterministic attack transforms on a topic's full message list. Pure functions: same input, same output.
import { parseRegistryEvent, runningHashV3, ZERO_RUNNING_HASH, type TopicMessage } from "@hashwitness/core";

export type AttackMode = "honest" | "tamper" | "replay" | "equivocate";

export interface AttackConfig {
  mode: AttackMode;
  /** tamper: drop revoke messages, or rewrite them into a harmless-looking body */
  tamperStyle: "drop-revoke" | "alter-body";
  /** replay: how many of the latest messages to hide */
  replayHide: number;
}

export const DEFAULT_CONFIG: AttackConfig = { mode: "honest", tamperStyle: "drop-revoke", replayHide: 1 };

/** The client the equivocating mirror tells the truth to (it lies to everyone else). */
export const TRUSTED_CLIENT = "hashwitness";

export interface AttackOutcome {
  messages: TopicMessage[];
  action: string; // human-readable log line
}

/** Renumbers from 1 and recomputes every running hash: the forged chain is internally valid. */
export function rechain(messages: TopicMessage[]): TopicMessage[] {
  let prev: Uint8Array = ZERO_RUNNING_HASH;
  return messages.map((m, i) => {
    const out = { ...m, sequenceNumber: i + 1 };
    const h = runningHashV3(prev, out);
    prev = h;
    return { ...out, runningHash: h.toString("base64") };
  });
}

function tamper(messages: TopicMessage[], style: AttackConfig["tamperStyle"]): AttackOutcome {
  const revokes = messages.filter((m) => parseRegistryEvent(m.message)?.type === "revoke").map((m) => m.sequenceNumber);
  if (revokes.length === 0) return { messages, action: "tamper: no revoke to hide" };
  if (style === "drop-revoke") {
    return {
      messages: rechain(messages.filter((m) => !revokes.includes(m.sequenceNumber))),
      action: `tamper: dropped revoke seq ${revokes.join(",")} and re-chained`,
    };
  }
  const altered = messages.map((m) => {
    if (!revokes.includes(m.sequenceNumber)) return m;
    const ev = parseRegistryEvent(m.message)!;
    return { ...m, message: Buffer.from(JSON.stringify({ ...ev, type: "issue" })).toString("base64") };
  });
  return { messages: rechain(altered), action: `tamper: rewrote revoke seq ${revokes.join(",")} as issue and re-chained` };
}

export function applyAttack(messages: TopicMessage[], cfg: AttackConfig, client: string | undefined): AttackOutcome {
  switch (cfg.mode) {
    case "honest":
      return { messages, action: "honest" };
    case "tamper":
      return tamper(messages, cfg.tamperStyle);
    case "replay": {
      const keep = Math.max(0, messages.length - cfg.replayHide);
      return { messages: messages.slice(0, keep), action: `replay: hid latest ${messages.length - keep} message(s)` };
    }
    case "equivocate":
      return client === TRUSTED_CLIENT
        ? { messages, action: `equivocate: truth to ${client}` }
        : { ...tamper(messages, "drop-revoke"), action: `equivocate: lie to ${client ?? "(no client header)"}` };
  }
}
