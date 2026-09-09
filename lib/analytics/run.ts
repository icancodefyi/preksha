import { prisma } from "@/lib/db/client";
import { buildCaseGraph } from "@/lib/graph/caseGraph";
import { simulateDisruption } from "@/lib/graph/engine";

// Phase 6.5 pattern: analytics are computed here (a background-job-shaped
// function, invoked by a route handler for MVP since there's no separate
// worker deployment yet) and PERSISTED as versioned runs. Read paths never
// recompute inline — they read the latest AnalyticalRun row.
export async function runAnalytics(caseId: string, triggeredById: string | null): Promise<void> {
  const graph = await buildCaseGraph(caseId);

  const topBy = (metric: "betweenness" | "pagerank" | "degree", n = 10) =>
    [...graph.nodes]
      .sort((a, b) => (graph.metrics[b.id][metric] as number) - (graph.metrics[a.id][metric] as number))
      .slice(0, n)
      .map((node) => ({ nodeId: node.id, key: node.key, value: graph.metrics[node.id][metric] }));

  const communities = new Map<number, string[]>();
  for (const n of graph.nodes) {
    const c = graph.metrics[n.id].community;
    communities.set(c, [...(communities.get(c) ?? []), n.key]);
  }

  const disruption = graph.nodes
    .map((n) => ({ key: n.key, ...simulateDisruption(graph, n.key) }))
    .sort((a, b) => b.fragmentationPct - a.fragmentationPct)
    .slice(0, 5);

  await prisma.$transaction([
    prisma.analyticalRun.create({
      data: { caseId, metric: "betweenness", resultSummary: topBy("betweenness"), triggeredById },
    }),
    prisma.analyticalRun.create({
      data: { caseId, metric: "pagerank", resultSummary: topBy("pagerank"), triggeredById },
    }),
    prisma.analyticalRun.create({
      data: { caseId, metric: "degree", resultSummary: topBy("degree"), triggeredById },
    }),
    prisma.analyticalRun.create({
      data: {
        caseId,
        metric: "community",
        resultSummary: [...communities.entries()].map(([community, members]) => ({ community, members })),
        triggeredById,
      },
    }),
    prisma.analyticalRun.create({
      data: { caseId, metric: "disruption", resultSummary: disruption, triggeredById },
    }),
  ]);
}
