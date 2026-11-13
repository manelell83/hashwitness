// Malicious mirror proxy for the attack demo. Sits in front of a real mirror and rewrites topic messages
// according to the current attack mode. LAB USE ONLY: it lies on purpose.
import express, { type Request, type Response } from "express";
import { CLIENT_HEADER, fetchTopicMessages, MirrorError, type TopicMessage } from "@hashwitness/core";
import { applyAttack, DEFAULT_CONFIG, type AttackConfig, type AttackMode } from "./attacks.ts";

export * from "./attacks.ts";

const MODES: AttackMode[] = ["honest", "tamper", "replay", "equivocate"];

export interface FakeMirrorOptions {
  upstream: string; // real mirror base URL
  fetchImpl?: typeof fetch;
  log?: (line: Record<string, unknown>) => void;
}

const toWire = (m: TopicMessage) => ({
  chunk_info: null,
  consensus_timestamp: m.consensusTimestamp,
  message: m.message,
  payer_account_id: m.payerAccountId,
  running_hash: m.runningHash,
  running_hash_version: m.runningHashVersion,
  sequence_number: m.sequenceNumber,
  topic_id: m.topicId,
});

export function createApp({ upstream, fetchImpl = fetch, log = (l) => console.log(JSON.stringify(l)) }: FakeMirrorOptions) {
  let config: AttackConfig = { ...DEFAULT_CONFIG };
  const app = express();
  app.use(express.json({ limit: "2kb" }));

  app.get("/admin/mode", (_req, res) => res.json(config));
  app.post("/admin/mode", (req: Request, res: Response) => {
    const b = (req.body ?? {}) as Partial<AttackConfig>;
    if (b.mode !== undefined && !MODES.includes(b.mode)) return res.status(400).json({ error: "invalid mode" });
    if (b.tamperStyle !== undefined && b.tamperStyle !== "drop-revoke" && b.tamperStyle !== "alter-body") {
      return res.status(400).json({ error: "invalid tamperStyle" });
    }
    if (b.replayHide !== undefined && !(Number.isInteger(b.replayHide) && b.replayHide >= 0 && b.replayHide <= 100)) {
      return res.status(400).json({ error: "invalid replayHide" });
    }
    config = { ...config, ...b };
    log({ ts: new Date().toISOString(), event: "mode_changed", config });
    return res.json(config);
  });

  // The whole topic is fetched upstream, transformed, and served as a single page (links.next = null).
  app.get("/api/v1/topics/:topicId/messages", async (req: Request, res: Response) => {
    const topicId = String(req.params.topicId);
    const client = req.header(CLIENT_HEADER);
    try {
      const { messages } = await fetchTopicMessages({ name: "upstream", baseUrl: upstream }, topicId, { fetchImpl });
      const out = applyAttack(messages, config, client);
      log({ ts: new Date().toISOString(), event: "served", mode: config.mode, topicId, client: client ?? null, action: out.action, upstream: messages.length, served: out.messages.length });
      res.json({ messages: out.messages.map(toWire), links: { next: null } });
    } catch (e) {
      const msg = e instanceof MirrorError ? e.message : "internal error";
      log({ ts: new Date().toISOString(), event: "upstream_error", topicId, error: msg });
      res.status(502).json({ _status: { messages: [{ message: msg }] } });
    }
  });

  return app;
}
