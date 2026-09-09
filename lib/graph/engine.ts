import { burner, cdr, firs, networkMembers, subscriberByPhone } from "@/lib/data/seed";
import type { NetworkMember } from "@/lib/data/types";

export interface GraphNode {
  id: string;
  key: string;
  name: string;
  alias: string;
  role: string;
  phone: string;
  phone2: string | null;
  cluster: string;
  city: string;
  type: "member" | "burner";
  known: boolean;
  firCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  calls: number;
  totalDuration: number;
  avgDuration: number;
  first: string | null;
  last: string | null;
}

export interface NodeMetrics {
  degree: number;
  weightedDegree: number;
  betweenness: number;
  pagerank: number;
  community: number;
}

export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: Record<string, NodeMetrics>;
  stats: {
    members: number;
    calls: number;
    clusters: string[];
    totalCallSeconds: number;
  };
}

const PHONE_TO_KEY = new Map<string, string>();
for (const m of networkMembers) {
  PHONE_TO_KEY.set(m.phone, m.key);
  if (m.phone2) PHONE_TO_KEY.set(m.phone2, m.key);
}

export function keyOfPhone(phone: string): string | null {
  return PHONE_TO_KEY.get(phone) ?? null;
}

export function phoneToNodeId(phone: string): string {
  const k = keyOfPhone(phone);
  return k ?? `burner-${phone}`;
}

function firCountFor(phone: string): number {
  const k = keyOfPhone(phone);
  if (!k) return 0;
  let c = 0;
  for (const f of firs) {
    const phones = f.entities?.phones ?? [];
    if (phones.includes(phone)) c += 1;
  }
  return c;
}

export function buildGraph(): NetworkGraph {
  // aggregate calls between any two *identified* phones (members + burner)
  const agg = new Map<string, { calls: number; duration: number; first: string | null; last: string | null }>();
  const membersSeen = new Map<string, NetworkMember>();

  for (const m of networkMembers) {
    membersSeen.set(m.phone, m);
    if (m.phone2) membersSeen.set(m.phone2, m);
  }
  // burner is identified by IMEI, but its phone is unknown yet — treat its phone as identified
  membersSeen.set(burner.phone, burner as unknown as NetworkMember);

  const keyed = (p: string) => membersSeen.has(p);

  for (const c of cdr) {
    if (!keyed(c.caller) || !keyed(c.receiver)) continue;
    const [a, b] = c.caller < c.receiver ? [c.caller, c.receiver] : [c.receiver, c.caller];
    if (a === b) continue;
    const cur = agg.get(`${a}|${b}`) ?? { calls: 0, duration: 0, first: null, last: null };
    cur.calls += 1;
    cur.duration += Number(c.duration_sec);
    if (!cur.first || c.timestamp < cur.first) cur.first = c.timestamp;
    if (!cur.last || c.timestamp > cur.last) cur.last = c.timestamp;
    agg.set(`${a}|${b}`, cur);
  }

  const nodes: GraphNode[] = [];
  const byPhone = new Map<string, GraphNode>();
  const mkNode = (phone: string) => {
    let node = byPhone.get(phone);
    if (node) return node;
    const m = membersSeen.get(phone)!;
    const isBurner = phone === burner.phone;
    node = {
      id: phoneToNodeId(phone),
      key: isBurner ? "burner" : (m as NetworkMember).key,
      name: isBurner ? "UNKNOWN (burner)" : (m as NetworkMember).name,
      alias: isBurner ? burner.alias : (m as NetworkMember).alias,
      role: isBurner ? "Burner device" : (m as NetworkMember).role,
      phone,
      phone2: isBurner ? null : (m as NetworkMember).phone2 ?? null,
      cluster: isBurner ? "unknown" : (m as NetworkMember).cluster,
      city: isBurner ? "Pune" : (m as NetworkMember).city,
      type: isBurner ? "burner" : "member",
      known: isBurner ? false : subscriberByPhone(phone) !== undefined,
      firCount: firCountFor(phone),
    };
    nodes.push(node);
    byPhone.set(phone, node);
    return node;
  };

  // nodes with at least one intra-network edge
  const hasEdge = new Set<string>();
  for (const k of agg.keys()) {
    const [a, b] = k.split("|");
    hasEdge.add(a);
    hasEdge.add(b);
  }
  for (const phone of hasEdge) mkNode(phone);

  const edges: GraphEdge[] = [];
  const rawEdges: { source: string; target: string; weight: number; calls: number; totalDuration: number; avgDuration: number; first: string | null; last: string | null }[] = [];

  for (const [k, v] of agg) {
    const [a, b] = k.split("|");
    if (!byPhone.has(a) || !byPhone.has(b)) continue;
    rawEdges.push({
      source: byPhone.get(a)!.id,
      target: byPhone.get(b)!.id,
      weight: v.calls,
      calls: v.calls,
      totalDuration: v.duration,
      avgDuration: Math.round(v.duration / v.calls),
      first: v.first,
      last: v.last,
    });
  }
  // include members that have FIR-recorded phones even if no intra-network calls (e.g. deepak-only? no) — not needed here

  const metrics = computeMetrics(nodes, rawEdges);
  const sortedEdges = [...rawEdges].sort((x, y) => y.weight - x.weight);

  const clusterSet = new Set<string>();
  for (const n of nodes) if (n.cluster !== "unknown") clusterSet.add(n.cluster);

  for (const e of sortedEdges) edges.push({ ...e });

  return {
    nodes,
    edges,
    metrics,
    stats: {
      members: membersSeen.size,
      calls: cdr.length,
      clusters: [...clusterSet],
      totalCallSeconds: cdr.reduce((s, c) => s + Number(c.duration_sec), 0),
    },
  };
}

export function computeMetrics(
  nodes: GraphNode[],
  rawEdges: { source: string; target: string; weight: number }[],
): Record<string, NodeMetrics> {
  const adj = new Map<string, Map<string, number>>();
  for (const n of nodes) adj.set(n.id, new Map());
  for (const e of rawEdges) {
    adj.get(e.source)!.set(e.target, e.weight);
    adj.get(e.target)!.set(e.source, e.weight);
  }

  const ids = nodes.map((n) => n.id);
  const idxOf = new Map<string, number>();
  ids.forEach((id, i) => idxOf.set(id, i));
  const N = ids.length;

  // unweighted betweenness (Brandes BFS)
  const betweenness = new Map<string, number>();
  ids.forEach((id) => betweenness.set(id, 0));
  for (const s of ids) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    const delta = new Map<string, number>();
    for (const v of ids) {
      pred.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
      delta.set(v, 0);
    }
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue: string[] = [s];
    while (queue.length) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of adj.get(v)!.keys()) {
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w)! === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
    }
  }

  // degree + weighted degree
  const degree = new Map<string, number>();
  const wdeg = new Map<string, number>();
  for (const n of nodes) {
    degree.set(n.id, adj.get(n.id)!.size);
    wdeg.set(n.id, [...adj.get(n.id)!.values()].reduce((a, b) => a + b, 0));
  }

  // pagerank (weighted, normalized)
  const damping = 0.85;
  const init = 1 / N;
  let pr = new Map<string, number>();
  ids.forEach((id) => pr.set(id, init));
  // out-degree weighting = weight / sum neighbors weight
  const outNorm = new Map<string, Map<string, number>>();
  for (const n of nodes) {
    const total = adj.get(n.id)!.size
      ? [...adj.get(n.id)!.values()].reduce((a, b) => a + b, 0)
      : 1;
    const norm = new Map<string, number>();
    for (const [w, val] of adj.get(n.id)!) norm.set(w, val / total);
    outNorm.set(n.id, norm);
  }
  for (let iter = 0; iter < 40; iter++) {
    const next = new Map<string, number>();
    let dangling = 0;
    ids.forEach((id) => {
      if (adj.get(id)!.size === 0) dangling += pr.get(id)!;
    });
    for (const n of ids) {
      let sum = 0;
      for (const m of ids) {
        if (outNorm.get(m)?.has(n)) sum += pr.get(m)! * outNorm.get(m)!.get(n)!;
      }
      next.set(n, (1 - damping) / N + damping * (sum + dangling / N));
    }
    pr = next;
  }

  // label propagation communities
  const label = new Map<string, number>();
  ids.forEach((id, i) => label.set(id, i));
  for (let iter = 0; iter < 30; iter++) {
    let changed = false;
    const order = [...ids].sort(() => Math.random() - 0.5);
    for (const v of order) {
      const counts = new Map<number, number>();
      for (const w of adj.get(v)!.keys()) {
        const l = label.get(w)!;
        counts.set(l, (counts.get(l) ?? 0) + adj.get(v)!.get(w)!);
      }
      if (counts.size === 0) continue;
      let best: number | null = null;
      let bestCount = -1;
      for (const [l, c] of counts) {
        if (c > bestCount) {
          bestCount = c;
          best = l;
        }
      }
      if (best !== null && best !== label.get(v)) {
        label.set(v, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // compress community ids
  const commMap = new Map<number, number>();
  let nextComm = 0;
  const communities = new Map<string, number>();
  for (const id of ids) {
    const l = label.get(id)!;
    if (!commMap.has(l)) commMap.set(l, nextComm++);
    communities.set(id, commMap.get(l)!);
  }

  const metrics: Record<string, NodeMetrics> = {};
  let maxB = 1;
  ids.forEach((id) => {
    maxB = Math.max(maxB, betweenness.get(id)!);
  });
  for (const n of nodes) {
    const id = n.id;
    metrics[id] = {
      degree: degree.get(id)!,
      weightedDegree: wdeg.get(id)!,
      betweenness: N > 2 ? (2 * betweenness.get(id)!) / ((N - 1) * (N - 2)) : betweenness.get(id)!,
      pagerank: pr.get(id)!,
      community: communities.get(id)!,
    };
  }
  return metrics;
}

export function graphForDisruption(): { nodes: GraphNode[]; edges: GraphEdge[]; metrics: Record<string, NodeMetrics> } {
  return buildGraph();
}

export function simulateDisruption(
  graph: NetworkGraph,
  removeKey: string,
): {
  removeKey: string;
  removedName: string | null;
  lccSizeBefore: number;
  lccSizeAfter: number;
  fragmentCountAfter: number;
  fragmentationPct: number;
  remainingBridges: string[];
} {
  const adj = new Map<string, Set<string>>();
  for (const n of graph.nodes) adj.set(n.id, new Set());
  for (const e of graph.edges) {
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const nodes = graph.nodes;
  const survivorIds = new Set<string>();
  for (const n of nodes) {
    if (n.key === removeKey) continue;
    survivorIds.add(n.id);
  }

  const lcc = (subset: Set<string>) => {
    const seen = new Set<string>();
    let largest = 0;
    for (const s of subset) {
      if (seen.has(s)) continue;
      const stack = [s];
      seen.add(s);
      let size = 0;
      while (stack.length) {
        const v = stack.pop()!;
        size += 1;
        for (const w of adj.get(v)!) {
          if (subset.has(w) && !seen.has(w)) {
            seen.add(w);
            stack.push(w);
          }
        }
      }
      largest = Math.max(largest, size);
    }
    return largest;
  };

  const before = lcc(new Set(nodes.map((n) => n.id)));
  const after = lcc(survivorIds);

  // count components after removal properly (fragments excluding isolated)
  const afterSeen = new Set<string>();
  let fragments = 0;
  for (const s of survivorIds) {
    if (afterSeen.has(s)) continue;
    const stack = [s];
    afterSeen.add(s);
    while (stack.length) {
      const v = stack.pop()!;
      for (const w of adj.get(v)!) {
        if (survivorIds.has(w) && !afterSeen.has(w)) {
          afterSeen.add(w);
          stack.push(w);
        }
      }
    }
    fragments += 1;
  }

  // remaining bridges (nodes with high betweenness among survivors)
  const removedNode = graph.nodes.find((n) => n.key === removeKey);
  const fragmentationPct =
    before > 0 ? Math.round(((before - after) / before) * 1000) / 10 : 0;

  const remainingBridges = graph.nodes
    .filter((n) => n.key !== removeKey)
    .sort((a, b) => graph.metrics[b.id].betweenness - graph.metrics[a.id].betweenness)
    .slice(0, 3)
    .map((n) => n.name);

  return {
    removeKey,
    removedName: removedNode?.name ?? null,
    lccSizeBefore: before,
    lccSizeAfter: after,
    fragmentCountAfter: fragments,
    fragmentationPct,
    remainingBridges,
  };
}