"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import { Loader2, ArrowUpRight, Grip, Target, ShieldX, GitBranch, Phone, MapPin } from "lucide-react";

interface GraphNode {
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
interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  calls: number;
}
interface NetworkData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metrics: Record<string, { degree: number; betweenness: number; pagerank: number; community: number }>;
  disruptionRanking: { name: string; fragmentationPct: number }[];
}
interface Dossier {
  name: string;
  alias: string | null;
  role: string;
  cluster: string;
  city: string;
  known: boolean;
  risk: number;
  firCount: number;
  phone: string;
  topContacts: { name: string; calls: number }[];
  money: { inflow: number; outflow: number; txns: number };
  metrics: { betweenness: number; pagerank: number } | null;
}

const CLUSTER_COLOR: Record<string, string> = {
  core: "#17152A",
  drugs: "#8b5cf6",
  finance: "#0d7abf",
  execution: "#d9562b",
  gambling: "#d9942d",
  unknown: "#9ca3af",
};

function forceLayout(nodes: GraphNode[], edges: GraphEdge[]) {
  const W = 1000;
  const H = 620;
  const pos = new Map<string, { x: number; y: number }>();
  const vel = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    const r = 150 + (i % 4) * 34;
    pos.set(n.id, { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r });
    vel.set(n.id, { x: 0, y: 0 });
  });

  const REST = 118;
  const REP = 4600;
  const DAMP = 0.86;
  const MAXV = 3.4;

  for (let iter = 0; iter < 240; iter++) {
    const force = new Map<string, { x: number; y: number }>();
    for (const n of nodes) force.set(n.id, { x: 0, y: 0 });

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        const f = REP / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        force.get(nodes[i].id)!.x += fx;
        force.get(nodes[i].id)!.y += fy;
        force.get(nodes[j].id)!.x -= fx;
        force.get(nodes[j].id)!.y -= fy;
      }
    }

    // Springs
    for (const e of edges) {
      const a = pos.get(e.source)!;
      const b = pos.get(e.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - REST) * 0.045;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      force.get(e.source)!.x += fx;
      force.get(e.source)!.y += fy;
      force.get(e.target)!.x -= fx;
      force.get(e.target)!.y -= fy;
    }

    // Center pull + integrate
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      const f = force.get(n.id)!;
      v.x = (v.x + f.x + (W / 2 - p.x) * 0.02) * DAMP;
      v.y = (v.y + f.y + (H / 2 - p.y) * 0.02) * DAMP;
      const sp = Math.sqrt(v.x * v.x + v.y * v.y);
      if (sp > MAXV) {
        v.x = (v.x / sp) * MAXV;
        v.y = (v.y / sp) * MAXV;
      }
      p.x += v.x;
      p.y += v.y;
    }
  }
  return pos;
}

export default function NetworkPage() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [simTarget, setSimTarget] = useState<string>("");
  const [sim, setSim] = useState<{
    name: string;
    fragmentationPct: number;
    lccSizeBefore: number;
    lccSizeAfter: number;
    fragmentCountAfter: number;
    remainingBridges: string[];
  } | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    fetch("/api/network")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setPositions(forceLayout(d.nodes, d.edges));
      });
  }, []);

  const bMax = useMemo(
    () => (data ? Math.max(...data.nodes.map((n) => data.metrics[n.id]?.betweenness ?? 0), 0.0001) : 1),
    [data],
  );

  const radiusOf = (n: GraphNode) => 7 + 13 * ((data?.metrics[n.id]?.betweenness ?? 0) / bMax);

  const select = async (n: GraphNode) => {
    setSelected(n);
    setDossier(null);
    setDossierLoading(true);
    try {
      const r = await fetch(`/api/suspects/${n.key}`);
      if (r.ok) setDossier(await r.json());
    } finally {
      setDossierLoading(false);
    }
  };

  const pointerDown = (e: React.PointerEvent, n: GraphNode) => {
    if (e.button !== 0) return;
    select(n);
    setDragId(n.id);
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const pointerMove = (e: React.PointerEvent) => {
    if (!dragId || !dragRef.current || !positions.has(dragId)) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const scale = 1000 / 960;
    setPositions((prev) => {
      const next = new Map(prev);
      const p = next.get(dragId)!;
      next.set(dragId, { x: p.x + dx * scale, y: p.y + dy * scale });
      return next;
    });
  };
  const pointerUp = () => setDragId(null);

  const runSimulation = async () => {
    if (!simTarget) return;
    setSimLoading(true);
    try {
      const r = await fetch(`/api/network?remove=${simTarget}`);
      const d = await r.json();
      setSim(d.disruption);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <WsShell
      title="Network graph"
      sub="Call-graph edges weighted by volume · node size = betweenness influence"
      right={
        <span className="hidden items-center gap-2 text-[11px] font-medium text-neutral-400 sm:flex">
          <Grip className="size-3.5" />
          drag nodes · click for dossier
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Graph canvas */}
        <div className="relative overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(16,15,25,0.04),0_12px_32px_-12px_rgba(16,15,25,0.10)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-neutral-100 px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Graph</p>
            {Object.entries(CLUSTER_COLOR)
              .filter(([c]) => data?.nodes.some((n) => n.cluster === c))
              .map(([c, color]) => (
                <span key={c} className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
                  <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                  {c}
                </span>
              ))}
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
              <GitBranch className="size-3.5" />
              {data ? `${data.nodes.length} nodes · ${data.edges.length} links` : "…"}
            </span>
          </div>

          <div className="relative h-[62vh] min-h-[420px] w-full touch-none select-none">
            {!data ? (
              <div className="flex h-full items-center justify-center gap-2 text-[13px] text-neutral-400">
                <Loader2 className="size-4 animate-spin" /> Building graph…
              </div>
            ) : (
              <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet" className="h-full w-full"
                onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={pointerUp}>
                {data.edges.map((e, i) => {
                  const a = positions.get(e.source);
                  const b = positions.get(e.target);
                  if (!a || !b) return null;
                  const w = e.weight / Math.max(...data.edges.map((x) => x.weight), 1);
                  return (
                    <line
                      key={i}
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="#8b8b94"
                      strokeWidth={0.7 + w * 2.4}
                      strokeOpacity={0.12 + w * 0.5}
                    />
                  );
                })}
                {data.nodes.map((n) => {
                  const p = positions.get(n.id);
                  if (!p) return null;
                  const r = radiusOf(n);
                  const color = n.type === "burner" ? "#dc2626" : CLUSTER_COLOR[n.cluster] ?? "#9ca3af";
                  const isSel = selected?.id === n.id;
                  const label =
                    (data.metrics[n.id]?.betweenness ?? 0) / bMax > 0.1 || n.firCount > 0 || n.type === "burner";
                  return (
                    <g key={n.id} onPointerDown={(e) => pointerDown(e, n)} className="cursor-pointer">
                      {isSel && (
                        <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke="#17152A" strokeWidth={1.5} strokeDasharray="4 3" />
                      )}
                      <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.6} />
                      {n.type === "burner" && (
                        <circle cx={p.x} cy={p.y} r={r + 3.5} fill="none" stroke="#dc2626" strokeWidth={1.4} strokeDasharray="3 2" />
                      )}
                      {label && (
                        <text
                          x={p.x} y={p.y - r - 8}
                          textAnchor="middle"
                          fontSize={isSel ? 12.5 : 11}
                          fontWeight={isSel ? 700 : 500}
                          fill="#3d3a49"
                          className="pointer-events-none"
                        >
                          {n.name}
                          {n.type === "burner" ? " ⚠" : ""}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Dossier */}
          <div className="rounded-3xl border border-neutral-200/80 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                {dossierLoading ? "Loading…" : selected ? "Node dossier" : "Select a node"}
              </p>
              {selected && (
                <Target className="size-4 text-neutral-300" />
              )}
            </div>

            {selected ? (
              <div className="px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[19px] font-medium tracking-[-0.02em] text-neutral-950">{selected.name}</h2>
                    <p className="mt-0.5 text-[12px] text-neutral-500">
                      {selected.alias ? `“${selected.alias}” · ` : ""}
                      {selected.role}
                      {selected.type === "burner" ? " · burned SIM" : ""}
                    </p>
                  </div>
                  <span
                    className="mt-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
                    style={{ backgroundColor: selected.type === "burner" ? "#dc2626" : CLUSTER_COLOR[selected.cluster] }}
                  >
                    {selected.type === "burner" ? "burner" : selected.cluster}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-3 text-[11px] text-neutral-500">
                  <span className="flex items-center gap-1"><Phone className="size-3" /> {selected.phone}</span>
                  <span className="flex items-center gap-1"><MapPin className="size-3" /> {selected.city}</span>
                </div>

                {dossier && dossier.metrics && (
                  <div className="mt-4 flex items-center gap-2.5">
                    <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                      <p className="text-[17px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                        {dossier.risk}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Risk / 100</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                      <p className="text-[17px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                        {Math.round(dossier.metrics.betweenness * 100) / 100}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Betweenness</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                      <p className="text-[17px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                        {dossier.firCount}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">FIRs</p>
                    </div>
                  </div>
                )}

                {dossier && dossier.topContacts.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Top contacts</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dossier.topContacts.slice(0, 4).map((c, i) => (
                        <span key={i} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                          {c.name}
                          <span className="ml-1 tabular-nums text-neutral-400">{c.calls}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  href={selected.type === "burner" ? "/suspects/burner" : `/suspects/${selected.key}`}
                  className="group mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-neutral-950"
                >
                  Open full dossier
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-[12.5px] leading-[1.6] text-neutral-400">
                Click a node to open its dossier, or drag to rearrange the graph.
                <div className="mt-5 rounded-2xl bg-neutral-50 px-4 py-3 text-left text-[11px] text-neutral-500">
                  <p className="mb-1 font-semibold text-neutral-700">Read the graph</p>
                  <p>Bigger node = higher betweenness (broker of communication). Cluster colour = the criminal economy each member sits in. The red dashed ring marks a burned SIM.</p>
                </div>
              </div>
            )}
          </div>

          {/* Disruption simulator */}
          <div className="rounded-3xl border border-neutral-200/80 bg-white">
            <div className="border-b border-neutral-100 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Disruption simulator</p>
              <p className="mt-1 text-[11px] leading-[1.5] text-neutral-400">
                Remove one suspect and see how far the network fragments.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex gap-2">
                <select
                  value={simTarget}
                  onChange={(e) => {
                    setSimTarget(e.target.value);
                    setSim(null);
                  }}
                  className="h-9 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-[12.5px] font-medium text-neutral-800 focus:border-neutral-400 focus:outline-none"
                >
                  <option value="">Remove whom…</option>
                  {(data?.disruptionRanking ?? []).map((d) => {
                    const n = data?.nodes.find((x) => x.name === d.name);
                    return n ? (
                      <option key={n.key} value={n.key}>
                        {n.name} — {d.fragmentationPct}%
                      </option>
                    ) : null;
                  })}
                </select>
                <button
                  onClick={runSimulation}
                  disabled={!simTarget || simLoading}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-neutral-950 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  {simLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldX className="size-3.5" />}
                  Remove
                </button>
              </div>

              {sim && (
                <div className="overflow-hidden rounded-2xl border border-neutral-200/70">
                  <div className="flex items-center justify-between bg-neutral-50 px-3.5 py-2.5">
                    <span className="text-[12px] font-semibold text-neutral-800">{sim.name} removed</span>
                    <span
                      className={cn(
                        "text-[15px] font-semibold tabular-nums",
                        sim.fragmentationPct > 30 ? "text-[#2f7c53]" : "text-[#96681c]",
                      )}
                    >
                      −{sim.fragmentationPct}% LCC
                    </span>
                  </div>
                  <dl className="divide-y divide-neutral-100 px-3.5">
                    {[
                      { k: "Largest component before", v: `${sim.lccSizeBefore} members` },
                      { k: "Largest component after", v: `${sim.lccSizeAfter} members` },
                      { k: "Fragments after", v: `${sim.fragmentCountAfter}` },
                      { k: "Remaining bridges", v: sim.remainingBridges.join(", ") },
                    ].map((row) => (
                      <div key={row.k} className="flex items-baseline justify-between gap-3 py-2.5">
                        <dt className="text-[11.5px] text-neutral-500">{row.k}</dt>
                        <dd className="text-right text-[11.5px] font-semibold tabular-nums text-neutral-900">{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </WsShell>
  );
}