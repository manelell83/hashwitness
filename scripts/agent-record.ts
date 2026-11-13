// Copies REAL cached LLM analyses (from .data/agent-cache, produced by live runs with LLM_MODEL) into
// demo-replay/, which DEMO_REPLAY=1 serves without network. Nothing is generated here.
//   pnpm agent:record
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { agentConfigFromEnv, cachePrefix } from "@hashwitness/agent";

const cfg = agentConfigFromEnv(new URL("../", import.meta.url));
if (!cfg.model) {
  console.error("Set LLM_MODEL (the model whose cached outputs you want to record).");
  process.exit(2);
}
const prefix = cachePrefix(cfg.model); // current prompt only
const files = existsSync(cfg.cacheDir) ? readdirSync(cfg.cacheDir).filter((f) => f.startsWith(prefix)) : [];
mkdirSync(cfg.recordingsDir, { recursive: true });
for (const f of files) copyFileSync(join(cfg.cacheDir, f), join(cfg.recordingsDir, f.slice(prefix.length)));
console.log(`recorded ${files.length} real ${cfg.model} analyses into ${cfg.recordingsDir}`);
