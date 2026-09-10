import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse } from "@/lib/http/errors";

export const runtime = "nodejs";

type Bucket = "hour" | "day";

function bucketKey(d: Date, bucket: Bucket): string {
  return bucket === "hour" ? d.toISOString().slice(0, 13) : d.toISOString().slice(0, 10);
}

// Phase 12.5 §6: bucketed by default (never one point per raw event) so the
// client never has to render thousands of individual timeline entries.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/timeline">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const bucket: Bucket = req.nextUrl.searchParams.get("bucket") === "day" ? "day" : "hour";

    const [events, txns] = await Promise.all([
      prisma.communicationEvent.findMany({ where: { caseId }, select: { timestamp: true } }),
      prisma.transaction.findMany({ where: { caseId }, select: { timestamp: true, amount: true } }),
    ]);

    const commBuckets = new Map<string, number>();
    for (const e of events) commBuckets.set(bucketKey(e.timestamp, bucket), (commBuckets.get(bucketKey(e.timestamp, bucket)) ?? 0) + 1);

    const finBuckets = new Map<string, { count: number; amount: number }>();
    for (const t of txns) {
      const k = bucketKey(t.timestamp, bucket);
      const cur = finBuckets.get(k) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += t.amount;
      finBuckets.set(k, cur);
    }

    const allKeys = new Set([...commBuckets.keys(), ...finBuckets.keys()]);
    const series = [...allKeys].sort().map((k) => ({
      bucket: k,
      calls: commBuckets.get(k) ?? 0,
      transactions: finBuckets.get(k)?.count ?? 0,
      amount: Math.round(finBuckets.get(k)?.amount ?? 0),
    }));

    return NextResponse.json({ bucket, series });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
