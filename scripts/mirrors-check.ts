// One real request per configured mirror on the registry topic: reachable? same chain as the consensus anchor?
// Prints mirror names and results only, never keys or URLs (a key can sit in a URL path).
//   pnpm mirrors:check
import { fetchTopicMessages, verifyChain, ZERO_RUNNING_HASH } from "@hashwitness/core";
import { env, readAnchor, realMirrors } from "./lib.ts";

const topic = env("REGISTRY_TOPIC_ID");
const anchor = await readAnchor(topic);
console.log(`registry ${topic}: consensus anchor seq ${anchor.sequence}`);
let ok = 0;
const mirrors = realMirrors();
for (const m of mirrors) {
  const t0 = Date.now();
  try {
    const { messages } = await fetchTopicMessages(m, topic, { timeoutMs: 8000 });
    const chain = verifyChain(messages, ZERO_RUNNING_HASH);
    const last = messages.at(-1);
    const atAnchor = last?.sequenceNumber === anchor.sequence && last.runningHash === anchor.runningHash;
    const good = chain.ok && atAnchor;
    ok += good ? 1 : 0;
    console.log(`${good ? "✓" : "✕"} ${m.name.padEnd(18)} ${messages.length} msgs, chain ${chain.ok ? "valid" : "BROKEN"}, ${atAnchor ? "matches anchor" : "does NOT match anchor"}  ${Date.now() - t0} ms`);
  } catch (e) {
    // Error message only: MirrorError messages carry no URL or header values.
    console.log(`✕ ${m.name.padEnd(18)} ${(e as Error).name}: ${(e as Error).message.slice(0, 120)}  ${Date.now() - t0} ms`);
  }
}
console.log(`${ok}/${mirrors.length} real mirrors verified`);
process.exit(ok === mirrors.length ? 0 : 1);
