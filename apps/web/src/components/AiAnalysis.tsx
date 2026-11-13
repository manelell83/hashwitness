import type { Forensic } from "../api.ts";

const ATTACK: Record<Forensic["attackType"], string> = {
  tamper: "Tampering",
  replay: "Replay (stale view)",
  equivocation: "Equivocation",
  benign_fault: "Benign fault",
};
const SOURCE: Record<Forensic["source"], string> = {
  llm: "LLM",
  cache: "LLM, cached",
  replay: "LLM, recorded",
  fallback: "Rule-based",
};

/** The AI's proposal. Visually secondary to the verdict, and explicit that it does not decide. */
export function AiAnalysis({ forensic }: { forensic: Forensic }) {
  return (
    <div className="ai-analysis" aria-labelledby="ai-title">
      <h3 id="ai-title">AI analysis <span className="muted">(proposes, does not decide)</span></h3>
      <p className="ai-headline">
        <strong>{ATTACK[forensic.attackType]}</strong>
        <span className="muted"> · confidence {Math.round(forensic.confidence * 100)}%</span>
      </p>
      <p>{forensic.explanation}</p>
      <p><strong>Recommended action:</strong> {forensic.recommendedAction}</p>
      <p className="muted">
        {Object.entries(forensic.mirrorAliases).map(([id, name]) => `${id} = ${name}`).join(" · ")}
      </p>
      <p className="muted ai-source">
        Source: {SOURCE[forensic.source]}{forensic.model ? ` (${forensic.model})` : ""}
        {forensic.fallbackReason ? `: ${forensic.fallbackReason}` : ""}
      </p>
      {!forensic.agreesWithRules && (
        <p className="ai-disagrees" role="note">
          <span aria-hidden="true">⚠</span> The AI label differs from the rule-based label. The verdict above is unaffected.
        </p>
      )}
    </div>
  );
}
