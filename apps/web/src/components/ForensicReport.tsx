import type { VerifyOutcome } from "../api.ts";
import { AiAnalysis } from "./AiAnalysis.tsx";
import { HashText } from "./HashText.tsx";

const KIND = { missing: "missing", altered: "altered", extra: "extra" } as const;

/** Deterministic findings (from core). The AI explanation (M5) will sit beside them, never replace them. */
export function ForensicReport({ outcome }: { outcome: VerifyOutcome }) {
  const { result: r, attestation } = outcome;
  return (
    <section className="card report" aria-labelledby="report-title">
      <h2 id="report-title">Forensic report</h2>
      <dl className="facts">
        <dt>Quorum</dt>
        <dd>{r.quorum.agreeing} of {r.quorum.n} mirrors agree (need {r.quorum.k})</dd>
        <dt>Anchor</dt>
        <dd>{r.anchor ? <>seq {r.anchor.sequence}, <HashText value={r.anchor.runningHash} label="anchor running hash" /></> : "none"}</dd>
        <dt>Disagreeing</dt>
        <dd>{r.disagreeing.length ? r.disagreeing.join(", ") : "none"}</dd>
        {r.credentialHash && (<><dt>Credential hash</dt><dd><HashText value={r.credentialHash} label="credential hash" /></dd></>)}
      </dl>

      {r.diff.length > 0 && (
        <>
          <h3>Differences by sequence number</h3>
          <ul className="diff">
            {r.diff.map((d) => (
              <li key={d.sequence}>
                <span className="mono">seq {d.sequence}</span> {KIND[d.kind]} in{" "}
                {Object.entries(d.byMirror).filter(([, h]) => h !== d.expected).map(([m]) => m).join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* DESIGN: placement and emphasis of the AI block (kept below the deterministic facts on purpose). */}
      {outcome.forensic && <AiAnalysis forensic={outcome.forensic} />}

      {attestation && (
        <p className="attested">
          Anchored on Hedera: attestation #{attestation.sequence}, report{" "}
          <HashText value={attestation.reportHash} label="report hash" />{" "}
          <a href={attestation.transactionUrl} target="_blank" rel="noreferrer">View on HashScan ↗</a>
        </p>
      )}
      {!attestation && <p className="attested muted">Not published to Hedera (offline demo).</p>}
    </section>
  );
}
