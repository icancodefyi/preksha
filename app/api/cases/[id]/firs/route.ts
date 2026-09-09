import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse } from "@/lib/http/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/firs">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const firs = await prisma.fir.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      select: { id: true, firNo: true, extractedEntities: true, extractorVersion: true, createdAt: true, fileId: true },
    });
    return NextResponse.json({ firs });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
