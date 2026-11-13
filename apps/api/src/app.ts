// HTTP API for the web demo. Holds the Hedera operator key server-side; the browser never sees it.
// Dependencies are injected so routes and input validation can be tested without network access.
import express, { type Request, type Response } from "express";
import type { Attestation, CredentialStatus, VerificationResult } from "@hashwitness/core";
import type { MetricsReport } from "@hashwitness/sim";
import type { Forensic } from "@hashwitness/agent";

export interface VerifyOutcome {
  result: VerificationResult;
  forensic: Forensic | null;
  attestation: { sequence: number; reportHash: string; transactionUrl: string } | null;
}

export interface AuditRow {
  sequence: number;
  consensusTimestamp: string;
  explorerUrl: string;
  attestation: Attestation;
  /** Does the locally stored report still hash to the value anchored on HCS? */
  reportCheck: "match" | "edited" | "not_stored";
}
export interface AuditOutcome {
  topicId: string;
  chainValid: boolean;
  entries: AuditRow[];
}

export interface NaiveOutcome {
  mirror: string;
  status: CredentialStatus;
  lastSequence: number;
  latencyMs: number;
}

export interface ApiDeps {
  config: () => { mirrors: string[]; attackerMirror: string; k: number; registryTopic: string; attestationTopic: string };
  verify: (credentialId: string, opts: { includeAttacker: boolean }) => Promise<VerifyOutcome>;
  /** What an app that trusts ONE mirror would conclude (no quorum, no chain check, no anchor). */
  naive: (credentialId: string, mirror: "attacker" | "public") => Promise<NaiveOutcome>;
  /** Attestations read back from the HCS attestation topic, newest first. */
  audit: () => Promise<AuditOutcome>;
  /** Simulation results, or null if `pnpm sim` has not been run yet. */
  metrics: () => Promise<MetricsReport | null>;
  getAttackMode: () => Promise<unknown>;
  setAttackMode: (body: unknown) => Promise<{ status: number; body: unknown }>;
}

const CREDENTIAL_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export function createApi(deps: ApiDeps) {
  const app = express();
  app.use(express.json({ limit: "2kb" }));

  const credential = (req: Request, res: Response): string | null => {
    const id = (req.body as { credentialId?: unknown } | undefined)?.credentialId;
    if (typeof id !== "string" || !CREDENTIAL_ID.test(id)) {
      res.status(400).json({ error: "credentialId must be 1-64 chars of A-Z a-z 0-9 . _ : -" });
      return null;
    }
    return id;
  };

  // Errors are logged server-side and returned as a generic message: never echo internals to the browser.
  const fail = (res: Response, what: string, e: unknown) => {
    console.error(`[api] ${what} failed: ${(e as Error).message}`);
    res.status(502).json({ error: `${what} failed` });
  };

  app.get("/api/config", (_req, res) => res.json(deps.config()));

  app.post("/api/verify", async (req, res) => {
    const id = credential(req, res);
    if (!id) return;
    try {
      res.json(await deps.verify(id, { includeAttacker: (req.body as { includeAttacker?: unknown }).includeAttacker === true }));
    } catch (e) {
      fail(res, "verification", e);
    }
  });

  app.post("/api/naive", async (req, res) => {
    const id = credential(req, res);
    if (!id) return;
    const mirror = (req.body as { mirror?: unknown }).mirror === "public" ? "public" : "attacker";
    try {
      res.json(await deps.naive(id, mirror));
    } catch (e) {
      fail(res, "naive read", e);
    }
  });

  app.get("/api/audit", async (_req, res) => {
    try {
      res.json(await deps.audit());
    } catch (e) {
      fail(res, "audit log", e);
    }
  });

  app.get("/api/metrics", async (_req, res) => {
    try {
      const m = await deps.metrics();
      if (m) res.json(m);
      else res.status(404).json({ error: "no metrics yet: run pnpm sim" });
    } catch (e) {
      fail(res, "metrics", e);
    }
  });

  app.get("/api/attack-mode", async (_req, res) => {
    try {
      res.json(await deps.getAttackMode());
    } catch (e) {
      fail(res, "attacker mirror", e);
    }
  });

  app.post("/api/attack-mode", async (req, res) => {
    try {
      const r = await deps.setAttackMode(req.body);
      res.status(r.status).json(r.body);
    } catch (e) {
      fail(res, "attacker mirror", e);
    }
  });

  return app;
}
