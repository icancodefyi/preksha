import { NextRequest, NextResponse } from "next/server";
import { semanticAnswer } from "@/lib/rag/localAnswer";

export const runtime = "nodejs";

// Additive alongside the existing /api/ask (deterministic keyword scoring,
// lib/graph/enrich.ts) — this is the new Qdrant+Jina+Groq semantic pipeline,
// kept as its own endpoint so the working /api/ask stays untouched while
// this gets proven out.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ answer: "", citations: [], retrievedCount: 0, unsupportedCitationsStripped: 0 });
  }
  try {
    const result = await semanticAnswer(q);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
