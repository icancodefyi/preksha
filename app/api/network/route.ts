import { simulateDisruption } from "@/lib/graph/engine";
import { disruptionFor, disruptionRanking, getGraph } from "@/lib/graph/enrich";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const remove = url.searchParams.get("remove");
  const removeKeys = remove ? remove.split(",").filter(Boolean) : [];
  const graph = getGraph();
  return Response.json({
    ...graph,
    disruption: removeKeys.length ? simulateDisruption(graph, removeKeys) : null,
    disruptionRanking: disruptionRanking(),
    kingpinSimulation: disruptionFor("rajesh"),
  });
}