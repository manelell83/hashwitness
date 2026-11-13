import { createHash } from "node:crypto";
const sha384 = (b) => createHash("sha384").update(b).digest();
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const id = (s) => s.split(".").map(BigInt);
// Java ObjectOutputStream framing, reproduced byte for byte
function runningHashV3(prev, m) {
  const [ps, pr, pn] = id(m.payer_account_id), [ts, tr, tn] = id(m.topic_id);
  const [sec, nano] = m.consensus_timestamp.split(".");
  const block = Buffer.concat([u64(3), u64(ps), u64(pr), u64(pn), u64(ts), u64(tr), u64(tn), u64(sec), u32(Number(nano)), u64(m.sequence_number)]);
  const buf = Buffer.concat([
    Buffer.from("aced0005", "hex"),
    Buffer.from("757200025b42acf317f8060854e0020000787000000030", "hex"), prev, // new byte[] w/ class desc
    Buffer.from([0x77, block.length]), block,                                      // block data
    Buffer.from("7571007e000000000030", "hex"), sha384(Buffer.from(m.message, "base64")), // byte[] w/ class ref
  ]);
  return sha384(buf);
}
const topic = process.argv[2], B = process.argv[3] ?? "https://testnet.mirrornode.hedera.com";
const { messages } = await (await fetch(`${B}/api/v1/topics/${topic}/messages?limit=25&order=asc`)).json();
let prev = Buffer.alloc(48), ok = 0;
for (const m of messages) {
  const got = runningHashV3(prev, m).toString("base64");
  const match = got === m.running_hash; ok += match;
  if (!match) console.log("MISMATCH seq", m.sequence_number, "chunk", JSON.stringify(m.chunk_info?.total));
  prev = Buffer.from(m.running_hash, "base64");
}
console.log(`${topic}: ${ok}/${messages.length} running hashes recomputed and matched`);
