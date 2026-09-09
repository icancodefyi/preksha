import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { getObject } from "@/lib/storage/objectStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/reports/[reportId]">) {
  try {
    const { id: caseId, reportId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report || report.caseId !== caseId) throw new ApiError(404, "not_found", "No such report in this case");

    const bytes = await getObject(report.objectStorageKey);
    return NextResponse.json({ report, content: JSON.parse(bytes.toString("utf-8")) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
