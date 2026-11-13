import { useState, type FormEvent } from "react";
import { api, type VerifyOutcome } from "../api.ts";
import { ForensicReport } from "../components/ForensicReport.tsx";
import { MirrorTable } from "../components/MirrorTable.tsx";
import { VerdictBadge } from "../components/VerdictBadge.tsx";

export function VerifyScreen() {
  const [credentialId, setCredentialId] = useState("DIP-002");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setOutcome(await api.verify(credentialId.trim(), false));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h1>Verify a credential</h1>
        <p>Checks the credential against several independent mirror nodes and the Hedera consensus network.</p>
        <form className="verify-form" onSubmit={submit}>
          <label htmlFor="cred">Credential ID</label>
          <div className="row">
            <input id="cred" className="input mono" value={credentialId} onChange={(e) => setCredentialId(e.target.value)}
              maxLength={64} required autoComplete="off" spellCheck={false} />
            <button className="btn" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify"}</button>
          </div>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {outcome && (
        <>
          <section className="card verdict-card" aria-label="Verdict">
            <VerdictBadge key={outcome.attestation?.sequence ?? Date.now()} verdict={outcome.result.verdict} revealed />
            <p className="mono">{outcome.result.credentialId}</p>
          </section>
          <section className="card">
            <h2>Mirror nodes</h2>
            <MirrorTable rows={outcome.result.mirrors} />
          </section>
          <ForensicReport outcome={outcome} />
        </>
      )}
    </div>
  );
}
