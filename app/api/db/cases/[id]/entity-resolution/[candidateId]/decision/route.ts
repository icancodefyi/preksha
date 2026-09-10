import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

// Phase 5.3: human review decision on a candidate merge. Reversible — a
// prior "accepted" (even an auto-accepted deterministic one) can be flipped
// to "rejected"/"reverted" here; nothing about a decision is destructive.
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/db/cases/[id]/entity-resolution/[candidateId]/decision">,
) {
  try {
    const { id: caseId, candidateId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "contribute");

    const body = await req.json().catch(() => null);
    const status = body?.status;
    if (!["accepted", "rejected", "reverted"].includes(status)) {
      throw new ApiError(422, "validation_error", "status must be accepted | rejected | reverted");
    }

    const candidate = await prisma.entityResolutionCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate || candidate.caseId !== caseId) {
      throw new ApiError(404, "not_found", "No such entity-resolution candidate in this case");
    }

    const updated = await prisma.entityResolutionCandidate.update({
      where: { id: candidateId },
      data: { status, decidedById: user.id, decidedAt: new Date() },
    });

    await writeAudit({
      actorId: user.id,
      action: "merge_entity_decision",
      caseId,
      resourceRef: `entity_resolution_candidate:${candidateId}`,
      requestSummary: { status },
    });

    return NextResponse.json({ candidate: updated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
