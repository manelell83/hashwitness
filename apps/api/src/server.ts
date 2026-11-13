import { credentialStatus, fetchTopicMessages, verifyCredential, CLIENT_HEADER } from "@hashwitness/core";
import { env, FAKE_MIRROR, publishAttestation, readAnchor, realMirrors } from "@hashwitness/scripts/lib";
import { agentConfigFromEnv, analyze } from "@hashwitness/agent";
import { createApi } from "./app.ts";

const agentCfg = agentConfigFromEnv(new URL("../../../", import.meta.url));

const port = Number(process.env.API_PORT ?? 5552);
const registryTopic = env("REGISTRY_TOPIC_ID");
const issuer = env("OPERATOR_ID");
const real = realMirrors();
// With the consensus-node anchor, a mirror whose full view ends at the anchor hash is proven correct
// (SHA-384 chain), so k only governs availability. Default: majority of the REAL mirrors.
// DESIGN: confirm the default quorum you want to present (override with QUORUM_K).
const k = Number(process.env.QUORUM_K ?? Math.floor(real.length / 2) + 1);

const app = createApi({
  config: () => ({
    mirrors: real.map((m) => m.name), attackerMirror: FAKE_MIRROR.name, k,
    registryTopic, attestationTopic: env("ATTESTATION_TOPIC_ID"),
  }),

  async verify(credentialId, { includeAttacker }) {
    const mirrors = includeAttacker ? [...real, FAKE_MIRROR] : real;
    const anchor = await readAnchor(registryTopic);
    const result = await verifyCredential({
      topicId: registryTopic, credentialId, issuer, mirrors, k: Math.min(k, mirrors.length), anchor, probeSplitView: true,
    });
    // The verdict is final here. The agent only adds an explanation, which is hashed into the report.
    const forensic = await analyze(result, agentCfg);
    const p = await publishAttestation({ v: 1, verification: result, forensic });
    return { result, forensic, attestation: { sequence: p.sequence, reportHash: p.attestation.reportHash, transactionUrl: p.transactionUrl } };
  },

  async naive(credentialId, which) {
    const base = which === "public" ? real[0]! : FAKE_MIRROR;
    const mirror = { ...base, headers: { ...base.headers, [CLIENT_HEADER]: "naive-app" } };
    const r = await fetchTopicMessages(mirror, registryTopic);
    return {
      mirror: base.name,
      status: credentialStatus(r.messages, credentialId, issuer).status,
      lastSequence: r.messages.at(-1)?.sequenceNumber ?? 0,
      latencyMs: r.latencyMs,
    };
  },

  async getAttackMode() {
    return (await fetch(`${FAKE_MIRROR.baseUrl}/admin/mode`, { signal: AbortSignal.timeout(3000) })).json();
  },

  async setAttackMode(body) {
    const r = await fetch(`${FAKE_MIRROR.baseUrl}/admin/mode`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
    });
    return { status: r.status, body: await r.json() };
  },
});

app.listen(port, "127.0.0.1", (err?: Error) => {
  if (err) {
    console.error(`api could not listen on ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`api on http://127.0.0.1:${port}  mirrors: ${real.map((m) => m.name).join(", ")} (+ attacker)  k=${k}`);
  const llm = agentCfg.demoReplay ? "DEMO_REPLAY (recordings, no network)" : agentCfg.apiKey && agentCfg.model ? `LLM ${agentCfg.model}` : "rule-based fallback (no LLM configured)";
  console.log(`forensic agent: ${llm}`);
});
