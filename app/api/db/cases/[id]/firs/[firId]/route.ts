import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/firs/[firId]">) {
  try {
    const { id: caseId, firId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const fir = await prisma.fir.findUnique({ where: { id: firId } });
    if (!fir || fir.caseId !== caseId) throw new ApiError(404, "not_found", "No such FIR in this case");

    return NextResponse.json({ fir });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
