export type AttackType = "tamper" | "replay" | "equivocation" | "benign_fault";
export const ATTACK_TYPES: AttackType[] = ["tamper", "replay", "equivocation", "benign_fault"];

/** Strict output contract of the forensic agent. */
export interface Analysis {
  attackType: AttackType;
  confidence: number; // 0..1
  explanation: string;
  recommendedAction: string;
}

const LIMITS = { explanation: 600, recommendedAction: 300 };
// Rejects placeholder answers such as "..." (seen from openai/gpt-oss-20b): they trigger the retry, then the fallback.
const MIN_LENGTH = 20;

/** JSON Schema sent to the provider (structured outputs). Our own validator below is the one that counts. */
export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["attackType", "confidence", "explanation", "recommendedAction"],
  properties: {
    attackType: { type: "string", enum: ATTACK_TYPES },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    explanation: { type: "string", minLength: MIN_LENGTH, maxLength: LIMITS.explanation },
    recommendedAction: { type: "string", minLength: MIN_LENGTH, maxLength: LIMITS.recommendedAction },
  },
} as const;

/** Validates untrusted model output. Returns null on any deviation: wrong keys, types, ranges or lengths. */
export function validateAnalysis(v: unknown): Analysis | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.join(",") !== "attackType,confidence,explanation,recommendedAction") return null;
  if (!ATTACK_TYPES.includes(o.attackType as AttackType)) return null;
  if (typeof o.confidence !== "number" || !Number.isFinite(o.confidence) || o.confidence < 0 || o.confidence > 1) return null;
  for (const k of ["explanation", "recommendedAction"] as const) {
    const s = o[k];
    if (typeof s !== "string" || s.trim().replace(/[.…\s]+$/, "").length < MIN_LENGTH || s.length > LIMITS[k]) return null;
  }
  return {
    attackType: o.attackType as AttackType,
    confidence: o.confidence as number,
    explanation: (o.explanation as string).trim(),
    recommendedAction: (o.recommendedAction as string).trim(),
  };
}

/** Parses a model reply: tolerates a ```json fence (common with cheaper models), nothing else. */
export function parseReply(content: unknown): Analysis | null {
  if (typeof content !== "string") return null;
  const unfenced = content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  try {
    return validateAnalysis(JSON.parse(unfenced));
  } catch {
    return null;
  }
}
