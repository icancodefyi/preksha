import { answerChat, SUGGESTED } from "@/lib/rag/pipeline";
import type { ChatRequest, ChatTurn } from "@/lib/rag/types";

// RAG endpoint. Accepts GET ?q=&case= (backwards compatible) and
// POST { question, history, case } for multi-turn, case-scoped chat.
// The pipeline embeds the question, cosine-searches the corpus (scoped to the
// case's FIRs when `case` is set), grounds Groq over the retrieved evidence,
// validates citations and refuses when nothing matches.

async function handle(q: string, history: ChatTurn[], caseId?: string) {
  if (!q.trim()) {
    return Response.json({ answer: "", sources: [], suggested: SUGGESTED, confidence: "low", trace: [] });
  }
  const req: ChatRequest = { question: q, history, caseId };
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
    return Response.json(
      { answer: "Invalid request body.", sources: [], suggested: SUGGESTED, confidence: "low", trace: [] },
      { status: 400 },
    );
  }
}
