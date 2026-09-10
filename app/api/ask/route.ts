import { answerQuestion } from "@/lib/graph/enrich";

const SUGGESTED = [
  "Who is the kingpin?",
  "How is the money moving?",
  "Who appears in more than one FIR?",
  "Why is the burner number a lead?",
];

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? "http://localhost:8000";

interface PyCitation {
  source_type: string;
  source_id: string;
  label: string;
  score: number;
}
interface PyTraceStep {
  label: string;
  detail: string;
  ms: number;
}
interface PyQueryResponse {
  answer: string;
  citations: PyCitation[];
  retrieved_count: number;
  unsupported_citations_stripped: number;
  trace: PyTraceStep[];
}

function confidenceOf(result: PyQueryResponse): "high" | "medium" | "low" {
  if (result.citations.length === 0) return "low";
  return result.unsupported_citations_stripped > 0 ? "medium" : "high";
}

// The RAG pipeline itself lives in rag_service/ (Python, FastAPI) — see
// rag_service/README.md for the full explanation. This route just proxies
// to it and keeps the original deterministic keyword-scored answerQuestion()
// (lib/graph/enrich.ts) as the fallback when that service is unreachable or
// finds no relevant evidence (Phase 10 "LLM unavailable": deterministic
// answers must still work, never a hard failure for the user) — but ONLY
// for unscoped (global) chat. A case-scoped chat ("Chat with case") must
// never silently widen to the global deterministic answerer on a miss or
// an outage — that would answer from data outside the case the investigator
// explicitly chose to stay inside, defeating the point of case scoping.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const caseId = url.searchParams.get("case");
  if (!q.trim()) {
    return Response.json({ answer: "", sources: [], suggested: SUGGESTED, confidence: "low", trace: [] });
  }

  try {
    const res = await fetch(`${RAG_SERVICE_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, case_id: caseId || undefined }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`rag_service returned ${res.status}`);
    const result: PyQueryResponse = await res.json();

    if (result.retrieved_count === 0) {
      if (caseId) {
        return Response.json({
          answer: "No relevant evidence found within this case for that question.",
          sources: [],
          suggested: SUGGESTED,
          confidence: "low",
          trace: result.trace,
        });
      }
      // Unscoped only: the deterministic path may still have a canned
      // answer for this exact question shape (e.g. "who is the kingpin?").
      return Response.json(answerQuestion(q));
    }
    return Response.json({
      answer: result.answer,
      sources: result.citations.map((c) => ({ label: c.label, ref: c.source_id })),
      suggested: SUGGESTED,
      confidence: confidenceOf(result),
      trace: result.trace,
    });
  } catch (err) {
    console.error("[ask] rag_service unreachable:", err);
    if (caseId) {
      return Response.json({
        answer: "Case-scoped chat is temporarily unavailable (the RAG service didn't respond).",
        sources: [],
        suggested: SUGGESTED,
        confidence: "low",
        trace: [],
      });
    }
    return Response.json(answerQuestion(q));
  }
}
