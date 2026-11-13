// Quorum verification of a credential across mirrors.
//   pnpm verify <credentialId> [--k 2] [--fake] [--no-anchor] [--no-probe]
//   --fake       add the local attacker mirror (start it with `pnpm fake-mirror`)
import { verifyCredential } from "@hashwitness/core";
import { env, FAKE_MIRROR, readAnchor, realMirrors } from "./lib.ts";

const args = process.argv.slice(2);
const credentialId = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
if (!credentialId) {
  console.error("usage: verify <credentialId> [--k N] [--fake] [--no-anchor] [--no-probe]");
  process.exit(2);
}
const kIdx = args.indexOf("--k");
const mirrors = [...realMirrors(), ...(args.includes("--fake") ? [FAKE_MIRROR] : [])];
const k = kIdx >= 0 ? Number(args[kIdx + 1]) : Math.floor(mirrors.length / 2) + 1;
const topicId = env("REGISTRY_TOPIC_ID");
const anchor = args.includes("--no-anchor") ? null : await readAnchor(topicId);

const r = await verifyCredential({
  topicId, credentialId, issuer: env("OPERATOR_ID"), mirrors, k, anchor, probeSplitView: !args.includes("--no-probe"),
});

console.log(`\nVERDICT: ${r.verdict}   (quorum ${r.quorum.agreeing} agreeing, need ${r.quorum.k} of ${r.quorum.n})`);
console.log(`anchor: ${anchor ? `seq ${anchor.sequence} ${anchor.runningHash.slice(0, 16)}…` : "none"}`);
console.table(r.mirrors.map((m) => ({
  mirror: m.mirror, state: m.state, "single-mirror app would say": m.splitViewStatus ?? m.credentialStatus ?? "-",
  lastSeq: m.lastSequence ?? "-", ms: m.latencyMs ?? "-", digest: m.digest ? `${m.digest.slice(0, 12)}…` : "-",
})));
if (r.diff.length) {
  console.log("diff (running hash per sequence number, vs reference):");
  for (const d of r.diff) {
    const cells = Object.entries(d.byMirror).map(([n, h]) => `${n}=${h === null ? "MISSING" : h === d.expected ? "ok" : `${h.slice(0, 10)}…`}`);
    console.log(`  seq ${d.sequence} ${d.kind}: ${cells.join("  ")}`);
  }
}
