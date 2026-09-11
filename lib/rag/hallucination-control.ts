// Hallucination control: every answer passes a retrieval score gate, then its
// citations are validated against what was actually retrieved. Anything the
// model invented is stripped; if nothing clears the gate, the pipeline refuses
// instead of guessing. Deterministic checks, not prompt hope.
import type { ScoredChunk, Citation } from "./types";

export const MIN_SCORE = 0.2;

export interface GateResult {
  accepted: ScoredChunk[];
  refused: boolean;
  reason?: string;
}

export function scoreGate(hits: ScoredChunk[], min = MIN_SCORE): GateResult {
  const accepted = hits.filter((h) => h.score >= min);
  if (accepted.length === 0) {
    return {
      accepted: [],
      refused: true,
      reason: "No relevant evidence was found for this question in the case material — I won't guess.",
    };
  }
  return { accepted, refused: false };
}

/** Keep only citations that point at a retrieved chunk; count the rest as stripped. */
export function verifyCitations(answer: string, context: ScoredChunk[]): { citations: Citation[]; stripped: number } {
  const byId = new Map(context.map((c) => [c.id, c.label]));
  const cited = [...answer.matchAll(/[[【]\s*([^\]】]+?)\s*[\]】]/g)]
    .flatMap((m) => m[1].split(/\s*[;,]\s*/).map((s) => s.trim()))
    .filter(Boolean);
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const c of cited) {
    const label = byId.get(c);
    if (label && !seen.has(c)) {
      seen.add(c);
      citations.push({ id: c, label });
    }
  }
  return { citations, stripped: cited.length - citations.length };
}
