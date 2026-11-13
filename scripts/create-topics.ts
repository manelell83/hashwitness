// Creates the "registry" and "attestation" HCS topics. Both have a submit key = operator key,
// so only the issuer (operator) can write to them.
import { TopicCreateTransaction } from "@hiero-ledger/sdk";
import { hashscanTopic, operatorKey, testnetClient } from "./lib.ts";

const client = testnetClient();
try {
  const ids: Record<string, string> = {};
  for (const name of ["registry", "attestation"] as const) {
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(`HashWitness ${name}`)
      .setSubmitKey(operatorKey().publicKey)
      .execute(client);
    const receipt = await tx.getReceipt(client);
    ids[name] = receipt.topicId!.toString();
    console.log(`${name}: ${ids[name]}  ${hashscanTopic(ids[name])}`);
  }
  console.log(`\nAdd to .env:\nREGISTRY_TOPIC_ID=${ids.registry}\nATTESTATION_TOPIC_ID=${ids.attestation}`);
} finally {
  client.close();
}
