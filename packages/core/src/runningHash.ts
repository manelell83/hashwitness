import { createHash } from "node:crypto";
import type { TopicMessage } from "./types.ts";

// HCS running hash v3, as computed by the consensus node
// (hiero-consensus-node ConsensusSubmitMessageHandler.updateRunningHashAndSequenceNumber).
// The node writes through a Java ObjectOutputStream, so the SHA-384 input contains Java
// serialization framing, not just the fields. Verified against 100/100 real testnet messages
// (NOTES.md §4).
const STREAM_HEADER = Buffer.from("aced0005", "hex");
// TC_ARRAY, TC_CLASSDESC "[B", serialVersionUID, SC_SERIALIZABLE, 0 fields, TC_ENDBLOCKDATA, TC_NULL, len=48
const NEW_BYTE_ARRAY_48 = Buffer.from("757200025b42acf317f8060854e0020000787000000030", "hex");
// TC_ARRAY, TC_REFERENCE to handle 0x7e0000 (the class desc above), len=48
const REF_BYTE_ARRAY_48 = Buffer.from("7571007e000000000030", "hex");
const BLOCK_LEN = 8 * 9 + 4; // nine longs + one int

export const ZERO_RUNNING_HASH = Buffer.alloc(48);

const sha384 = (b: Uint8Array): Buffer => createHash("sha384").update(b).digest();

function u64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(n);
  return b;
}

function entityId(id: string): [bigint, bigint, bigint] {
  const parts = id.split(".");
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) throw new Error(`bad entity id: ${id}`);
  return [BigInt(parts[0]!), BigInt(parts[1]!), BigInt(parts[2]!)];
}

/** Computes the v3 running hash of `msg` given the previous running hash (48 zero bytes for seq 1). */
export function runningHashV3(prev: Uint8Array, msg: TopicMessage): Buffer {
  if (prev.length !== 48) throw new Error("previous running hash must be 48 bytes");
  const [ps, pr, pn] = entityId(msg.payerAccountId);
  const [ts, tr, tn] = entityId(msg.topicId);
  const [secs, nanos] = msg.consensusTimestamp.split(".") as [string, string];
  const nanoBuf = Buffer.alloc(4);
  nanoBuf.writeUInt32BE(Number(nanos));
  const block = Buffer.concat([
    u64(3n), u64(ps), u64(pr), u64(pn), u64(ts), u64(tr), u64(tn),
    u64(BigInt(secs)), nanoBuf, u64(BigInt(msg.sequenceNumber)),
  ]);
  return sha384(
    Buffer.concat([
      STREAM_HEADER,
      NEW_BYTE_ARRAY_48, prev,
      Buffer.from([0x77, BLOCK_LEN]), block,
      REF_BYTE_ARRAY_48, sha384(Buffer.from(msg.message, "base64")),
    ]),
  );
}

export type ChainResult =
  | { ok: true; lastSequence: number; lastRunningHash: string }
  | { ok: false; firstBadSequence: number; reason: "gap" | "hash_mismatch" | "unsupported_version" };

/**
 * Verifies that `messages` (ascending, contiguous) form a valid running-hash chain.
 * `prev` is the running hash just before the first message (zero hash when starting at seq 1).
 * A valid chain proves internal consistency only: an unsigned chain can be fabricated end to end,
 * so it must also be compared against an independent anchor (consensus-node TopicInfoQuery).
 */
export function verifyChain(messages: TopicMessage[], prev: Uint8Array = ZERO_RUNNING_HASH): ChainResult {
  let expectedSeq = messages[0]?.sequenceNumber ?? 1;
  let prevHash: Uint8Array = prev;
  let last = Buffer.from(prev).toString("base64");
  for (const m of messages) {
    if (m.sequenceNumber !== expectedSeq) return { ok: false, firstBadSequence: expectedSeq, reason: "gap" };
    if (m.runningHashVersion !== 3) return { ok: false, firstBadSequence: m.sequenceNumber, reason: "unsupported_version" };
    const computed = runningHashV3(prevHash, m);
    if (computed.toString("base64") !== m.runningHash) {
      return { ok: false, firstBadSequence: m.sequenceNumber, reason: "hash_mismatch" };
    }
    prevHash = computed;
    last = m.runningHash;
    expectedSeq++;
  }
  return { ok: true, lastSequence: expectedSeq - 1, lastRunningHash: last };
}
