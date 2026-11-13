// Lists attestations from the attestation topic and checks each reportHash against the locally stored report.
//   pnpm audit-log [limit]
import { existsSync, readFileSync } from "node:fs";
import { auditEntries, fetchTopicMessages, reportHash, verifyChain, type Report } from "@hashwitness/core";
import { env, PUBLIC_MIRROR, REPORTS_DIR } from "./lib.ts";

const limit = Number(process.argv[2] ?? 10);
const topicId = env("ATTESTATION_TOPIC_ID");
const { messages } = await fetchTopicMessages(PUBLIC_MIRROR, topicId);
const chain = verifyChain(messages);
console.log(`attestation topic ${topicId}: ${messages.length} messages, chain ${chain.ok ? "valid" : JSON.stringify(chain)}`);

for (const e of auditEntries(messages, env("OPERATOR_ID")).slice(0, limit)) {
  const a = e.attestation;
  const file = new URL(`${a.reportHash}.json`, REPORTS_DIR);
  const local = existsSync(file)
    ? reportHash(JSON.parse(readFileSync(file, "utf8")) as Report) === a.reportHash ? "report ✓ matches" : "report ✕ EDITED"
    : "report not stored here";
  console.log(
    `#${e.sequence} ${a.targetCredential} ${a.verdict.padEnd(12)} ${a.mirrorsAgreeing}/${a.mirrorsQueried} agree (k=${a.quorumSize})` +
      `  ${local}  https://hashscan.io/testnet/transaction/${e.consensusTimestamp}`,
  );
}
