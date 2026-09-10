import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";
import { generateReport } from "@/lib/reports/generate";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/reports">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");
    const reports = await prisma.report.findMany({ where: { caseId }, orderBy: { generatedAt: "desc" } });
    return NextResponse.json({ reports });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/reports">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "contribute");

    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "Case Report";
    if (title.length > 200) throw new ApiError(422, "validation_error", "title too long");

    const { report, body: content } = await generateReport(caseId, title, user.id);

    await writeAudit({
      actorId: user.id,
      action: "export_report",
      caseId,
      resourceRef: `report:${report.id}`,
      requestSummary: { title },
    });

    return NextResponse.json({ report, content }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
