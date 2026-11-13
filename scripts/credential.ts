// Issue or revoke a credential on the registry topic.
//   pnpm credential issue  <credentialId> [diploma.json]
//   pnpm credential revoke <credentialId>
import { readFileSync } from "node:fs";
import { credentialStatus, fetchTopicMessages, type RegistryEvent } from "@hashwitness/core";
import { PUBLIC_MIRROR, canonicalJson, demoDiploma, env, sha256Hex, submitMessage } from "./lib.ts";

const [action, credentialId, file] = process.argv.slice(2);
if ((action !== "issue" && action !== "revoke") || !credentialId) {
  console.error("usage: credential issue|revoke <credentialId> [diploma.json]");
  process.exit(2);
}
const topicId = env("REGISTRY_TOPIC_ID");
const issuer = env("OPERATOR_ID");

let credentialHash: string;
if (action === "issue") {
  const doc = file ? JSON.parse(readFileSync(file, "utf8")) : demoDiploma(credentialId);
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
const r = await submitMessage(topicId, JSON.stringify(event));
console.log(`${action} ${credentialId}: seq=${r.sequence}`);
console.log(`tx: ${r.transactionUrl}`);
