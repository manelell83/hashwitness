import type { MirrorReport, MirrorState } from "../api.ts";
import { HashText } from "./HashText.tsx";

const STATE: Record<MirrorState, { icon: string; word: string; liar: boolean }> = {
  agree: { icon: "✓", word: "Agrees", liar: false },
  forged: { icon: "✕", word: "Forged history", liar: true },
  stale: { icon: "✕", word: "Stale view", liar: true },
  split_view: { icon: "✕", word: "Two-faced", liar: true },
  broken_chain: { icon: "✕", word: "Broken chain", liar: true },
  unreachable: { icon: "–", word: "Unreachable", liar: false },
};

/** A row is either a finished report, or a mirror still being queried (name only). */
export type MirrorRowData = MirrorReport | { mirror: string; pending: true };

/** `compact` drops the digest column (half-width cards in the Attack Lab). */
export function MirrorTable({ rows, compact = false }: { rows: MirrorRowData[]; compact?: boolean }) {
  return (
    <div className={`mirror-table${compact ? " is-compact" : ""}`} role="table" aria-label="Mirror nodes">
      <div className="mirror-row mirror-head" role="row">
        <span role="columnheader">Mirror</span>
        {!compact && <span role="columnheader">Digest</span>}
        <span role="columnheader">Latency</span>
        <span role="columnheader">Status</span>
      </div>
      {rows.map((r) => {
        if ("pending" in r) {
          return (
            <div key={r.mirror} className="mirror-row is-pending" role="row">
              <span role="cell">{r.mirror}</span>
              {!compact && <span role="cell" className="muted">…</span>}
              <span role="cell" className="muted">…</span>
              <span role="cell" className="muted">Querying</span>
            </div>
          );
        }
        const s = STATE[r.state];
        return (
          <div key={r.mirror} className={`mirror-row ${s.liar ? "is-liar" : r.state === "agree" ? "is-agree" : ""}`} role="row">
            <span role="cell">{r.mirror}</span>
            {!compact && <span role="cell">{r.digest ? <HashText value={r.digest} keep={6} label={`digest from ${r.mirror}`} /> : "–"}</span>}
            <span role="cell" className="mono">{r.latencyMs === null ? "–" : `${r.latencyMs} ms`}</span>
            <span role="cell" className={`mirror-state state-${r.state}`}>
              <span aria-hidden="true">{s.icon}</span> {s.word}
            </span>
          </div>
        );
      })}
    </div>
  );
}
