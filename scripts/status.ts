// Reads a credential's status through ONE mirror, verifies the running-hash chain locally,
// and compares the chain head with the topic state read directly from a consensus node.
//   pnpm status <credentialId>
import { TopicInfoQuery } from "@hiero-ledger/sdk";
import { credentialStatus, fetchTopicMessages, verifyChain } from "@hashwitness/core";
import { PUBLIC_MIRROR, env, testnetClient } from "./lib.ts";

const credentialId = process.argv[2];
if (!credentialId) {
  console.error("usage: status <credentialId>");
  process.exit(2);
}
const topicId = env("REGISTRY_TOPIC_ID");

const { messages, latencyMs } = await fetchTopicMessages(PUBLIC_MIRROR, topicId);
const status = credentialStatus(messages, credentialId, env("OPERATOR_ID"));
const chain = verifyChain(messages);
console.log(`mirror ${PUBLIC_MIRROR.name}: ${messages.length} messages in ${latencyMs} ms`);
console.log(`chain: ${JSON.stringify(chain)}`);
console.log(`credential ${credentialId}: ${JSON.stringify(status)}`);

// Anchor: the consensus node's view of the topic head (a paid query, fractions of a cent).
const client = testnetClient();
try {
  const info = await new TopicInfoQuery().setTopicId(topicId).execute(client);
  const anchor = { sequence: info.sequenceNumber.toNumber(), runningHash: Buffer.from(info.runningHash).toString("base64") };
  const match = chain.ok && chain.lastSequence === anchor.sequence && chain.lastRunningHash === anchor.runningHash;
  console.log(`anchor (consensus node): ${JSON.stringify(anchor)}`);
  console.log(`mirror chain head matches anchor: ${match}`);
} finally {
  client.close();
}
