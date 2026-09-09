import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

const LEVELS = ["read", "contribute", "manage"];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/assignments">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");
    const assignments = await prisma.caseAssignment.findMany({
      where: { caseId },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
    return NextResponse.json({ assignments });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

// Granting access is itself a "manage"-only action — only someone who
// already manages the case can widen who else can see it (Principle 18).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/assignments">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "manage");

    const body = await req.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username : null;
    const accessLevel = typeof body?.accessLevel === "string" ? body.accessLevel : null;
    if (!username || !accessLevel || !LEVELS.includes(accessLevel)) {
      throw new ApiError(422, "validation_error", `username and accessLevel (${LEVELS.join("|")}) are required`);
    }

    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) throw new ApiError(404, "not_found", "No such user");

    const assignment = await prisma.caseAssignment.upsert({
      where: { caseId_userId: { caseId, userId: target.id } },
      update: { accessLevel, grantedById: user.id, grantedAt: new Date() },
      create: { caseId, userId: target.id, accessLevel, grantedById: user.id },
    });

    await writeAudit({
      actorId: user.id,
      action: "grant_case_access",
      caseId,
      resourceRef: `user:${target.id}`,
      requestSummary: { username, accessLevel },
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
