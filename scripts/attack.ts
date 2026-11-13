// Switch the local fake mirror's attack mode.
//   pnpm attack honest | tamper [drop-revoke|alter-body] | replay [N] | equivocate
import { FAKE_MIRROR } from "./lib.ts";

const [mode, opt] = process.argv.slice(2);
const body: Record<string, unknown> = { mode };
if (mode === "tamper" && opt) body.tamperStyle = opt;
if (mode === "replay" && opt) body.replayHide = Number(opt);

const res = await fetch(`${FAKE_MIRROR.baseUrl}/admin/mode`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
