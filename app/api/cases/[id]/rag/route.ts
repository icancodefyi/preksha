import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";
import { answerQuery } from "@/lib/rag/answer";

export const runtime = "nodejs";

// Phase 3 Principle 3 / Phase 9.3: AuthZ is checked BEFORE any retrieval —
// requireCaseAccess runs before answerQuery is ever called, so an
// unauthorized case reference fails here and never reaches a data query.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/rag">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const body = await req.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) throw new ApiError(422, "validation_error", "query is required");

    const result = await answerQuery(caseId, query);

    await writeAudit({
      actorId: user.id,
      action: "rag_query",
      caseId,
      requestSummary: { query },
      resultSummary: { intent: result.intent, confidence: result.confidence, citationCount: result.citations.length },
    });

    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
