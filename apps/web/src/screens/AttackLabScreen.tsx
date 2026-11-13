import { useEffect, useRef, useState } from "react";
import { api, type AttackMode, type Config, type NaiveOutcome, type VerifyOutcome } from "../api.ts";
import { ForensicReport } from "../components/ForensicReport.tsx";
import { MirrorTable, type MirrorRowData } from "../components/MirrorTable.tsx";
import { statusAsVerdict, VerdictBadge } from "../components/VerdictBadge.tsx";

const MODES: { mode: AttackMode; label: string; help: string }[] = [
  { mode: "honest", label: "Honest", help: "The attacker mirror tells the truth." },
  { mode: "tamper", label: "Tamper", help: "Deletes the revocation and rebuilds a valid-looking hash chain." },
  { mode: "replay", label: "Replay", help: "Serves an old snapshot that predates the revocation." },
  { mode: "equivocate", label: "Equivocate", help: "Tells HashWitness the truth and lies to everyone else." },
];
const STAGGER_MS = 120;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function AttackLabScreen({ config }: { config: Config }) {
  const [credentialId, setCredentialId] = useState("DIP-001");
  const [mode, setMode] = useState<AttackMode | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [naive, setNaive] = useState<NaiveOutcome | null>(null);
  const [witness, setWitness] = useState<VerifyOutcome | null>(null);
  const [shown, setShown] = useState(0); // mirror rows revealed so far (stagger)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const mirrorNames = [...config.mirrors, config.attackerMirror];

  useEffect(() => {
    api.attackMode().then((m) => setMode(m.mode)).catch(() => setModeError("Attacker mirror is not running (pnpm fake-mirror)."));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const changeMode = async (m: AttackMode) => {
    setModeError(null);
    try {
      setMode((await api.setAttackMode(m)).mode);
      setNaive(null);
      setWitness(null);
      setShown(0);
    } catch {
      setModeError("Could not reach the attacker mirror (pnpm fake-mirror).");
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setNaive(null);
    setWitness(null);
    timers.current.forEach(clearTimeout);
    if (reducedMotion()) setShown(mirrorNames.length);
    else {
      setShown(0);
      timers.current = mirrorNames.map((_, i) => window.setTimeout(() => setShown(i + 1), STAGGER_MS * (i + 1)));
    }
    const id = credentialId.trim();
    // The naive app answers as soon as its single mirror does; HashWitness waits for the quorum.
    const n = api.naive(id).then(setNaive);
    const w = api.verify(id, true).then(setWitness);
    const results = await Promise.allSettled([n, w]);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setError((failed.reason as Error).message);
    setBusy(false);
  };

  const rows: MirrorRowData[] = witness
    ? witness.result.mirrors
    : mirrorNames.slice(0, shown).map((m) => ({ mirror: m, pending: true as const }));

  return (
    <div className="stack">
      <section className="card">
        <h1>Attack Lab</h1>
        <p>One mirror node is controlled by an attacker. Compare an app that trusts it with HashWitness.</p>
        <fieldset className="mode-switch">
          <legend>Attacker mode</legend>
          <div className="segmented" role="radiogroup" aria-label="Attacker mode">
            {MODES.map((m) => (
              <button key={m.mode} type="button" role="radio" aria-checked={mode === m.mode}
                className={`btn ${mode === m.mode ? "" : "btn-ghost"}`} onClick={() => changeMode(m.mode)}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="muted">{MODES.find((m) => m.mode === mode)?.help ?? ""}</p>
          {modeError && <p className="error" role="alert">{modeError}</p>}
        </fieldset>
        <div className="row">
          <label htmlFor="lab-cred" className="sr-only">Credential ID</label>
          <input id="lab-cred" className="input mono" value={credentialId} onChange={(e) => setCredentialId(e.target.value)} maxLength={64} />
          <button className="btn" type="button" onClick={run} disabled={busy || mode === null}>{busy ? "Verifying…" : "Verify"}</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <div className="lab">
        <section className="card lab-naive" aria-labelledby="naive-title">
          <h2 id="naive-title">Naive app</h2>
          <p className="muted">Trusts one mirror: <span className="mono">{config.attackerMirror}</span></p>
          {naive && (
            <>
              <VerdictBadge verdict={statusAsVerdict(naive.status)} />
              <p className="muted">Read {naive.lastSequence} messages in {naive.latencyMs} ms. No cross-check.</p>
            </>
          )}
        </section>

        <section className="card lab-witness" aria-labelledby="witness-title">
          <h2 id="witness-title">HashWitness</h2>
          <p className="muted">Quorum of {config.k} over {mirrorNames.length} mirrors, anchored on a consensus node.</p>
          {(shown > 0 || witness) && <MirrorTable rows={rows} compact />}
          {witness && <VerdictBadge key={witness.attestation?.sequence ?? "v"} verdict={witness.result.verdict} revealed />}
        </section>
      </div>

      {witness && <ForensicReport outcome={witness} />}
    </div>
  );
}
