import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse } from "@/lib/http/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/entity-resolution">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const candidates = await prisma.entityResolutionCandidate.findMany({
      where: { caseId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ candidates });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
