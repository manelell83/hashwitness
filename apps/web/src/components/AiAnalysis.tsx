import type { Forensic } from "../api.ts";

const ATTACK: Record<Forensic["attackType"], string> = {
  tamper: "Tampering",
  replay: "Replay (stale view)",
  equivocation: "Equivocation",
  benign_fault: "Benign fault",
};
/** Which engine answered, in words (never color alone). */
export function engineLabel(f: Pick<Forensic, "source" | "model" | "fallbackReason">): string {
  if (f.source === "fallback") return `Rule-based fallback${f.fallbackReason ? ` (${f.fallbackReason})` : ""}`;
  const how = f.source === "cache" ? ", cached" : f.source === "replay" ? ", recorded" : "";
  return `LLM: ${f.model ?? "unknown model"}${how}`;
}

/** The AI's proposal. Visually secondary to the verdict, and explicit that it does not decide. */
export function AiAnalysis({ forensic }: { forensic: Forensic }) {
  return (
    <div className="ai-analysis" aria-labelledby="ai-title">
      <h3 id="ai-title">AI analysis <span className="muted">(proposes, does not decide)</span></h3>
      <p className={`ai-engine ${forensic.source === "fallback" ? "is-fallback" : "is-llm"}`}>
        Engine: <strong>{engineLabel(forensic)}</strong>
      </p>
      <p className="ai-headline">
        <strong>{ATTACK[forensic.attackType]}</strong>
        <span className="muted"> · confidence {Math.round(forensic.confidence * 100)}%</span>
      </p>
      <p>{forensic.explanation}</p>
      <p><strong>Recommended action:</strong> {forensic.recommendedAction}</p>
      <p className="muted">
        {Object.entries(forensic.mirrorAliases).map(([id, name]) => `${id} = ${name}`).join(" · ")}
      </p>
      {!forensic.agreesWithRules && (
        <p className="ai-disagrees" role="note">
          <span aria-hidden="true">⚠</span> The AI label differs from the rule-based label. The verdict above is unaffected.
        </p>
      )}
    </div>
  );
}
