import { answerQuestion } from "@/lib/graph/enrich";
import { semanticAnswer, type SemanticAnswer } from "@/lib/rag/localAnswer";

const SUGGESTED = [
  "Who is the kingpin?",
  "How is the money moving?",
  "Who appears in more than one FIR?",
  "Why is the burner number a lead?",
];

function confidenceOf(result: SemanticAnswer): "high" | "medium" | "low" {
  if (result.citations.length === 0) return "low";
  return result.unsupportedCitationsStripped > 0 ? "medium" : "high";
}

// Qdrant + Jina + Groq semantic RAG is the primary path; the original
// deterministic keyword-scored answerQuestion() (lib/graph/enrich.ts) is the
// fallback — used when the semantic pipeline errors (API outage, missing
// key) or turns up no relevant evidence at all (Phase 10 "LLM unavailable":
// deterministic answers must still work, never a hard failure for the user).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return Response.json({ answer: "", sources: [], suggested: SUGGESTED, confidence: "low", trace: [] });
  }

  try {
    const result = await semanticAnswer(q);
    if (result.retrievedCount === 0) {
      // No semantic match — the deterministic path may still have a canned
      // answer for this exact question shape (e.g. "who is the kingpin?").
      return Response.json(answerQuestion(q));
    }
    return Response.json({
      answer: result.answer,
      sources: result.citations.map((c) => ({ label: c.label, ref: c.sourceId })),
      suggested: SUGGESTED,
      confidence: confidenceOf(result),
      trace: result.trace,
    });
  } catch (err) {
    console.error("[ask] semantic pipeline failed, falling back to deterministic:", err);
    return Response.json(answerQuestion(q));
  }
}
