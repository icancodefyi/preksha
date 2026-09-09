import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/ingestion/jobs/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(req);

    const job = await prisma.ingestionJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "not_found", "No such ingestion job");
    await requireCaseAccess(user, job.caseId, "read");

    return NextResponse.json({ job });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
