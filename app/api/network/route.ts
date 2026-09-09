import { simulateDisruption } from "@/lib/graph/engine";
import { disruptionFor, disruptionRanking, getGraph } from "@/lib/graph/enrich";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const remove = url.searchParams.get("remove");
  const graph = getGraph();
  return Response.json({
    ...graph,
    disruption: remove ? simulateDisruption(graph, remove) : null,
    disruptionRanking: disruptionRanking(),
    kingpinSimulation: disruptionFor("rajesh"),
  });
}