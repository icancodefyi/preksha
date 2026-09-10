import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse } from "@/lib/http/errors";
import { buildCaseGraph } from "@/lib/graph/caseGraph";

export const runtime = "nodejs";

// Phase 4 cross-view-selection principle: "selecting an entity in one view
// should show connected people, cases, FIRs, locations, financial
// transactions, timeline, evidence" — this endpoint IS that consolidated
// view, keyed by a phone number (the only identifier real per-case ingested
// data reliably carries pre-entity-resolution; see docs Phase 5.3/ADR-06 for
// why we don't invent a canonical Person id ahead of a real merge decision).
export async function GET(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/entities/[ref]">) {
  try {
    const { id: caseId, ref } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const phone = decodeURIComponent(ref);

    const [events, firs, linkedCandidates, graph] = await Promise.all([
      prisma.communicationEvent.findMany({
        where: { caseId, OR: [{ caller: phone }, { receiver: phone }] },
        orderBy: { timestamp: "asc" },
      }),
      prisma.fir.findMany({ where: { caseId } }),
      prisma.entityResolutionCandidate.findMany({
        where: { caseId, status: "accepted", OR: [{ entityARef: `phone:${phone}` }, { entityBRef: `phone:${phone}` }] },
      }),
      buildCaseGraph(caseId),
    ]);

    const mentionedInFirs = firs
      .filter((f) => {
        const entities = f.extractedEntities as { phones?: string[] } | null;
        return entities?.phones?.includes(phone);
      })
      .map((f) => ({ id: f.id, firNo: f.firNo, narrativeExcerpt: f.narrative.slice(0, 200) }));

    const nodeId = `phone:${phone}`;
    const metrics = graph.metrics[nodeId] ?? null;
    const contacts = graph.edges
      .filter((e) => e.source === nodeId || e.target === nodeId)
      .map((e) => ({
        contact: (e.source === nodeId ? e.target : e.source).replace("phone:", ""),
        calls: e.calls,
        totalDuration: e.totalDuration,
        first: e.first,
        last: e.last,
      }))
      .sort((a, b) => b.calls - a.calls);

    const linkedIdentifiers = linkedCandidates.map((c) =>
      (c.entityARef === `phone:${phone}` ? c.entityBRef : c.entityARef).replace("phone:", ""),
    );

    return NextResponse.json({
      phone,
      known: events.length > 0 || mentionedInFirs.length > 0,
      metrics,
      contacts,
      firs: mentionedInFirs,
      linkedIdentifiers, // phones resolved to the same real-world entity (Phase 5.3)
      communicationEventCount: events.length,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
