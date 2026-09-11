// "Ask Preksha" RAG pipeline — retrieval → grounded generation → validation.
//
// Flow per question:
//   1. resolve the case scope (case-<idx> -> its FIR numbers)
//   2. embed the question (Jina)
//   3. cosine-search the corpus (case-scoped when a case is set)
//   4. score gate → refuse if nothing relevant
//   5. Groq generates a grounded answer over the retrieved evidence only
//   6. validate citations → strip any the model invented
// The deterministic graph engine is kept ONLY as a last-resort fallback when
// the RAG keys are missing, so the demo never hard-fails.

import { embedQuery } from "./embeddings";
import { search } from "./store";
import { generateAnswer } from "./llm";
import { scoreGate, verifyCitations } from "./hallucination-control";
import { withResolvedSubject } from "./chat";
import { answerQuestion } from "@/lib/graph/enrich";
import { getCase } from "@/lib/data/cases";
import type { ChatRequest, ChatResult, TraceStep } from "./types";

export const SUGGESTED = [
  "Who is the kingpin?",
  "How is the money moving?",
  "Who appears in more than one FIR?",
  "Why is the burner number a lead?",
  "Who should we arrest first?",
  "What happened before the Dadar robbery?",
];

function resolveCase(caseId?: string): { firNos: string[]; title: string } | undefined {
  if (!caseId) return undefined;
  const c = getCase(caseId);
  if (!c) return undefined;
  return { firNos: c.firs.map((f) => f.fir_no), title: c.title };
}

export async function answerChat(req: ChatRequest): Promise<ChatResult> {
  const q = req.question.trim();
  const history = req.history ?? [];
  const t0 = Date.now();
  const trace: TraceStep[] = [];
  const mark = (label: string, detail?: string) => trace.push({ label, detail, ms: Date.now() - t0 });

  if (!q) return { answer: "", sources: [], suggested: SUGGESTED, confidence: "low", trace };

  const scope = resolveCase(req.caseId);

  // Resolve pronouns against the conversation before retrieval, so a follow-up
  // like "his details" searches for the actual person, not the word "his".
  const resolvedQuestion = withResolvedSubject(q, history);

  // Case-scoped chat: augment the query with the case title + FIR numbers so
  // even a vague question ("what happened") anchors to this case's records.
  const retrievalQuestion = scope
    ? `${resolvedQuestion}. Case: ${scope.title} (${scope.firNos.join(", ")})`
    : resolvedQuestion;

  try {
    const vector = await embedQuery(retrievalQuestion);
    mark("Embedded the question", "Jina embeddings v3");

    const hits = await search(vector, retrievalQuestion, 6, scope?.firNos);
    mark(
      "Retrieved evidence",
      `${hits.length} passage${hits.length === 1 ? "" : "s"}${scope ? ` scoped to ${scope.firNos.length} FIR${scope.firNos.length === 1 ? "" : "s"}` : ""}`,
    );

    const gate = scoreGate(hits);
    if (gate.refused) {
      return { answer: gate.reason ?? "No relevant evidence found.", sources: [], suggested: SUGGESTED, confidence: "low", trace };
    }

    const answer = await generateAnswer(resolvedQuestion, gate.accepted, history);
    mark("Generated grounded answer", `Groq (${process.env.GROQ_MODEL ?? "llama-3.1-8b-instant"})`);

    const { citations, stripped } = verifyCitations(answer, gate.accepted);
    mark(
      "Validated citations",
      `${citations.length} confirmed${stripped ? `, ${stripped} unsupported stripped` : ""}`,
    );

    return {
      answer,
      sources: citations.map((c) => ({ label: c.label, ref: c.id })),
      suggested: SUGGESTED,
      confidence: citations.length ? "high" : "medium",
      trace,
    };
  } catch (err) {
    console.error("[rag] pipeline failed, falling back to deterministic:", String(err));
    const det = answerQuestion(q);
    return {
      answer: det.answer,
      sources: det.sources,
      suggested: SUGGESTED,
      confidence: det.confidence,
      trace: [...trace, { label: "RAG unavailable", detail: "fell back to deterministic engine", ms: Date.now() - t0 }],
    };
  }
}
