import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";
import { runAnalytics } from "@/lib/analytics/run";

export const runtime = "nodejs";

const METRICS = ["betweenness", "pagerank", "degree", "community", "disruption"];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/analytics">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const latestPerMetric = await Promise.all(
      METRICS.map((metric) =>
        prisma.analyticalRun.findFirst({ where: { caseId, metric }, orderBy: { computedAt: "desc" } }),
      ),
    );

    return NextResponse.json({ runs: latestPerMetric.filter(Boolean) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

// Synchronous for MVP (fast at routine-case scale, Phase 15) — production
// moves this behind the job queue like ingestion once graphs are large
// enough that inline computation risks a slow request (docs Phase 13).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/analytics">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "contribute");

    await runAnalytics(caseId, user.id);
    await writeAudit({ actorId: user.id, action: "run_analytics", caseId });

    const runs = await Promise.all(
      METRICS.map((metric) =>
        prisma.analyticalRun.findFirst({ where: { caseId, metric }, orderBy: { computedAt: "desc" } }),
      ),
    );
    return NextResponse.json({ runs });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
