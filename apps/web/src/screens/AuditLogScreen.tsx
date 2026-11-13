import { useEffect, useRef, useState } from "react";
import { api, type AuditOutcome, type AuditRow } from "../api.ts";
import { HashText } from "../components/HashText.tsx";
import { VerdictBadge } from "../components/VerdictBadge.tsx";

const POLL_MS = 5000;
const CHECK: Record<AuditRow["reportCheck"], { icon: string; word: string; cls: string }> = {
  match: { icon: "✓", word: "Report matches its anchored hash", cls: "check-ok" },
  edited: { icon: "✕", word: "Report was EDITED after anchoring", cls: "check-bad" },
  not_stored: { icon: "–", word: "Report not stored on this machine", cls: "muted" },
};

const consensusTime = (ts: string) => new Date(Number(ts.split(".")[0]) * 1000).toLocaleString();

export function AuditLogScreen() {
  const [data, setData] = useState<AuditOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const known = useRef<number | null>(null); // highest sequence seen; null until the first load

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await api.audit();
        if (!alive) return;
        const top = d.entries[0]?.sequence ?? 0;
        // Moment 2: only attestations that arrive while the screen is open get .is-new
        if (known.current !== null) setFresh(new Set(d.entries.filter((e) => e.sequence > known.current!).map((e) => e.sequence)));
        known.current = Math.max(known.current ?? 0, top);
        setData(d);
        setError(null);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const t = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  return (
    <div className="stack">
      <section className="card">
        <h1>Audit log</h1>
        <p>
          Every verification is anchored on the Hedera Consensus Service. Anyone can re-hash a report and compare it with
          the value on the public ledger.
        </p>
        {data && (
          <p className="muted">
            Topic <span className="mono">{data.topicId}</span> ·{" "}
            <a href={`https://hashscan.io/testnet/topic/${data.topicId}`} target="_blank" rel="noreferrer">View on HashScan ↗</a> ·
            running-hash chain {data.chainValid ? "✓ valid" : "✕ INVALID"}
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <ol className="log" aria-label="Attestations, newest first">
        {data?.entries.map((e) => {
          const a = e.attestation;
          const c = CHECK[e.reportCheck];
          return (
            <li key={e.sequence} className={`card log-entry${fresh.has(e.sequence) ? " is-new" : ""}`}>
              <div className="log-head">
                <span className="mono">#{e.sequence}</span>
                <span className="mono">{a.targetCredential}</span>
                <VerdictBadge verdict={a.verdict} size="small" />
              </div>
              <dl className="facts">
                <dt>Quorum</dt><dd>{a.mirrorsAgreeing} of {a.mirrorsQueried} mirrors agreed (need {a.quorumSize})</dd>
                <dt>Consensus time</dt><dd>{consensusTime(e.consensusTimestamp)}</dd>
                <dt>Report hash</dt><dd><HashText value={a.reportHash} label="report hash" /></dd>
                <dt>Integrity</dt><dd className={c.cls}><span aria-hidden="true">{c.icon}</span> {c.word}</dd>
              </dl>
              <a href={e.explorerUrl} target="_blank" rel="noreferrer">View transaction on HashScan ↗</a>
            </li>
          );
        })}
      </ol>
      {data && data.entries.length === 0 && <p className="muted">No attestations yet. Run a verification first.</p>}
    </div>
  );
}
