import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse } from "@/lib/http/errors";
import { buildCaseGraph } from "@/lib/graph/caseGraph";

export const runtime = "nodejs";

// Phase 15 rendering budget: cap nodes returned so the client never gets an
// unbounded graph dump; a caller wanting more must narrow (future: by
// entity/date range), not receive "the whole case" by default.
const NODE_LIMIT = 800;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/graph">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const graph = await buildCaseGraph(caseId);
    const truncated = graph.nodes.length > NODE_LIMIT;
    const keptIds = new Set(graph.nodes.slice(0, NODE_LIMIT).map((n) => n.id));

    return NextResponse.json({
      nodes: truncated ? graph.nodes.filter((n) => keptIds.has(n.id)) : graph.nodes,
      edges: truncated
        ? graph.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
        : graph.edges,
      metrics: graph.metrics,
      stats: graph.stats,
      truncated,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
