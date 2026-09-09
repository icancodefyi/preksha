import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

// The drill-down target every citation in a RAG answer or report points to
// (Phase 8.4 / Phase 11) — "why does this fact exist" resolves here.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/evidence/[evidenceId]">) {
  try {
    const { id: caseId, evidenceId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { file: true },
    });
    if (!evidence || evidence.caseId !== caseId) {
      throw new ApiError(404, "not_found", "No such evidence record in this case");
    }

    await writeAudit({ actorId: user.id, action: "view_evidence", caseId, resourceRef: `evidence:${evidenceId}` });

    return NextResponse.json({ evidence });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
