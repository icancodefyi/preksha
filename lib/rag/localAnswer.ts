import { qdrant, COLLECTION } from "@/lib/rag/qdrantClient";
import { embedQuery } from "@/lib/rag/jina";
import { generateGrounded } from "@/lib/rag/groq";

export interface SemanticCitation {
  sourceType: string;
  sourceId: string;
  label: string;
  score: number;
}

export interface TraceStep {
  label: string;
  detail?: string;
  ms: number; // cumulative elapsed since the request started, not a per-step duration
}

export interface SemanticAnswer {
  answer: string;
  citations: SemanticCitation[];
  retrievedCount: number;
  unsupportedCitationsStripped: number;
  trace: TraceStep[];
}

const TOP_K = 5;
const MIN_SCORE = 0.3; // cosine similarity floor — below this, treat as "no relevant evidence" rather than force a weak match

/**
 * Full Qdrant-backed RAG pipeline (Phase 8.1): embed query -> vector search
 * -> guarded generation over retrieved evidence only -> validate every
 * citation the model used against what was actually retrieved, stripping
 * anything it didn't (Phase 8.4 — never trust the model's citations as-is).
 */
export async function semanticAnswer(question: string): Promise<SemanticAnswer> {
  const t0 = Date.now();
  const trace: TraceStep[] = [];
  const mark = (label: string, detail?: string) => trace.push({ label, detail, ms: Date.now() - t0 });

  const vector = await embedQuery(question);
  mark("Embedded the question", "Jina embeddings v3 · retrieval.query");

  const result = await qdrant.query(COLLECTION, {
    query: vector,
    limit: TOP_K,
    with_payload: true,
    score_threshold: MIN_SCORE,
  });
  const hits = result.points;
  mark("Searched the evidence index", `Qdrant · ${hits.length} match${hits.length === 1 ? "" : "es"} above threshold`);

  if (hits.length === 0) {
    return {
      answer: "No relevant evidence found in the indexed case material for this question.",
      citations: [],
      retrievedCount: 0,
      unsupportedCitationsStripped: 0,
      trace,
    };
  }

  const retrieved = hits.map((h) => {
    const p = h.payload as { sourceType: string; sourceId: string; label: string; text: string };
    return { ...p, score: h.score };
  });

  const evidenceBlock = retrieved
    .map((d) => `[${d.sourceId}] (${d.label})\n${d.text}`)
    .join("\n\n---\n\n");

  const { text } = await generateGrounded(question, evidenceBlock);
  mark("Generated a grounded answer", `Groq (${process.env.GROQ_MODEL})`);

  // Citation validation: only ids the model actually cited AND that were
  // actually retrieved survive — an id the model invents is silently absent
  // from the retrieved set and gets dropped here, never surfaced as fact.
  // Match both ASCII [id] and the full-width 【id】 brackets some models
  // substitute regardless of prompt instruction (observed empirically) —
  // parsing has to be robust to model output, not just the ideal case.
  // Allow (and trim) whitespace padding inside the brackets — observed the
  // model writing "[ tower_MUM-008 ]" despite instructions, which the old
  // \s-excluding pattern silently failed to match at all, dropping valid
  // citations rather than flagging them unsupported. `+?` (lazy) stops at
  // the first closing bracket so multi-citation sentences don't get merged.
  // Two more real, observed failure modes handled here:
  // - a zero-width space (U+200B) landed right after "[" in one response —
  //   invisible when printed, and NOT matched by JS's \s (a known regex
  //   gotcha: U+200B is excluded from \s), so it survived the old trim and
  //   left the captured id one invisible character off from the real one.
  // - multiple ids in one bracket, e.g. "[tower_MUM-008 ; tower_MUM-009]" —
  //   split on common separators rather than treating the whole thing as
  //   one (unmatchable) id.
  const stripZeroWidth = (s: string) => s.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  const citedIds = new Set(
    [...text.matchAll(/[[【]\s*([^\]】]+?)\s*[\]】]/g)]
      .flatMap((m) => stripZeroWidth(m[1]).split(/\s*[;,]\s*/))
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const validCitations = retrieved.filter((d) => citedIds.has(d.sourceId));
  const strippedCount = citedIds.size - validCitations.length;
  mark(
    "Validated citations",
    strippedCount > 0
      ? `${validCitations.length} confirmed, ${strippedCount} unsupported citation(s) stripped`
      : `${validCitations.length} confirmed against retrieved evidence`,
  );

  return {
    answer: text,
    citations: validCitations.map((d) => ({ sourceType: d.sourceType, sourceId: d.sourceId, label: d.label, score: d.score })),
    retrievedCount: retrieved.length,
    unsupportedCitationsStripped: Math.max(0, strippedCount),
    trace,
  };
}
