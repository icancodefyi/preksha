import { answerChat, SUGGESTED, type AskRequest } from "@/lib/rag/pipeline";
import type { ChatTurn } from "@/lib/rag/chat";

// Deterministic-first RAG, fully in-app (no separate Python service).
// Accepts GET ?q= (backwards compatible) and POST { question, history } for
// multi-turn chat. The pipeline resolves pronouns against the conversation,
// answers known analytical shapes from the graph engine instantly, and only
// uses a grounded, citation-validated LLM for free-form questions — with a
// hard refusal when no evidence matches. Zero hallucination by construction.

async function handle(q: string, history: ChatTurn[], caseId?: string) {
  if (!q.trim()) {
    return Response.json({ answer: "", sources: [], suggested: SUGGESTED, confidence: "low", trace: [] });
  }
  const req: AskRequest = { question: q, history, caseId };
  const result = await answerChat(req);
  return Response.json(result);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const caseId = url.searchParams.get("case") ?? undefined;
  return handle(q, [], caseId);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: string; history?: ChatTurn[]; case?: string };
    return handle(body.question ?? "", body.history ?? [], body.case);
  } catch {
    return Response.json({ answer: "Invalid request body.", sources: [], suggested: SUGGESTED, confidence: "low", trace: [] }, { status: 400 });
  }
}
