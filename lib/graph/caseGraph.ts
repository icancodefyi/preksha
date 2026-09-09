import { prisma } from "@/lib/db/client";
import { computeMetrics, type GraphEdge, type GraphNode, type NetworkGraph } from "@/lib/graph/engine";

// Case-scoped graph builder over REAL ingested Postgres data (as opposed to
// lib/graph/engine.ts's buildGraph(), which reads the static demo seed and
// stays untouched — this is additive, not a replacement, per ADR-01: the
// static engine keeps powering the existing demo pages, this powers newly
// uploaded per-case data). Unresolved phone numbers become their own nodes
// (id = "phone:<number>") until entity resolution links them to a canonical
// person — mirrors the seed engine's "burner" pattern for unknowns.
export async function buildCaseGraph(caseId: string): Promise<NetworkGraph> {
  const events = await prisma.communicationEvent.findMany({ where: { caseId } });

  const agg = new Map<string, { calls: number; duration: number; first: string | null; last: string | null }>();
  for (const c of events) {
    const [a, b] = c.caller < c.receiver ? [c.caller, c.receiver] : [c.receiver, c.caller];
    if (a === b) continue;
    const key = `${a}|${b}`;
    const cur = agg.get(key) ?? { calls: 0, duration: 0, first: null, last: null };
    cur.calls += 1;
    cur.duration += c.durationSec;
    const ts = c.timestamp.toISOString();
    if (!cur.first || ts < cur.first) cur.first = ts;
    if (!cur.last || ts > cur.last) cur.last = ts;
    agg.set(key, cur);
  }

  const nodes: GraphNode[] = [];
  const byPhone = new Map<string, GraphNode>();
  const mkNode = (phone: string) => {
    let node = byPhone.get(phone);
    if (node) return node;
    node = {
      id: `phone:${phone}`,
      key: phone,
      name: phone, // renamed once entity resolution links a canonical identity
      alias: "",
      role: "unresolved",
      phone,
      phone2: null,
      cluster: "unknown",
      city: "",
      type: "member",
      known: false,
      firCount: 0,
    };
    nodes.push(node);
    byPhone.set(phone, node);
    return node;
  };

  const rawEdges: { source: string; target: string; weight: number }[] = [];
  const edges: GraphEdge[] = [];
  for (const [key, v] of agg) {
    const [a, b] = key.split("|");
    const na = mkNode(a);
    const nb = mkNode(b);
    rawEdges.push({ source: na.id, target: nb.id, weight: v.calls });
    edges.push({
      source: na.id,
      target: nb.id,
      weight: v.calls,
      calls: v.calls,
      totalDuration: v.duration,
      avgDuration: Math.round(v.duration / v.calls),
      first: v.first,
      last: v.last,
    });
  }
  edges.sort((x, y) => y.weight - x.weight);

  const metrics = computeMetrics(nodes, rawEdges);

  return {
    nodes,
    edges,
    metrics,
    stats: {
      members: nodes.length,
      calls: events.length,
      clusters: [],
      totalCallSeconds: events.reduce((s, c) => s + c.durationSec, 0),
    },
  };
}
