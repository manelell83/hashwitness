// Issue or revoke a credential on the registry topic.
//   pnpm credential issue  <credentialId> [diploma.json]
//   pnpm credential revoke <credentialId>
import { readFileSync } from "node:fs";
import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { credentialStatus, fetchTopicMessages, type RegistryEvent } from "@hashwitness/core";
import { PUBLIC_MIRROR, canonicalJson, env, sha256Hex, testnetClient } from "./lib.ts";

const [action, credentialId, file] = process.argv.slice(2);
if ((action !== "issue" && action !== "revoke") || !credentialId) {
  console.error("usage: credential issue|revoke <credentialId> [diploma.json]");
  process.exit(2);
}
const topicId = env("REGISTRY_TOPIC_ID");
const issuer = env("OPERATOR_ID");

let credentialHash: string;
if (action === "issue") {
  // DESIGN: demo diploma content; replace with the real credential document format if you have one.
  const doc = file
    ? JSON.parse(readFileSync(file, "utf8"))
    : { credentialId, holder: "Demo Student", degree: "MSc Cybersecurity", school: "Demo School", year: 2026 };
  credentialHash = sha256Hex(canonicalJson(doc));
} else {
  const { messages } = await fetchTopicMessages(PUBLIC_MIRROR, topicId);
  const s = credentialStatus(messages, credentialId, issuer);
  if (s.status !== "ISSUED") {
    console.error(`Cannot revoke ${credentialId}: status is ${s.status}`);
    process.exit(1);
  }
  credentialHash = s.credentialHash!;
}

const event: RegistryEvent = { type: action, credentialId, credentialHash, issuer, ts: new Date().toISOString() };
const client = testnetClient();
try {
  const tx = await new TopicMessageSubmitTransaction({ topicId, message: JSON.stringify(event) }).execute(client);
  const receipt = await tx.getReceipt(client);
  console.log(`${action} ${credentialId}: status=${receipt.status.toString()} seq=${receipt.topicSequenceNumber?.toString()}`);
  console.log(`tx: https://hashscan.io/testnet/transaction/${tx.transactionId.toString()}`);
} finally {
  client.close();
}
