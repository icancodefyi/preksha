"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ArrowUpRight,
  Grip,
  Target,
  ShieldX,
  GitBranch,
  Phone,
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Landmark,
  CreditCard,
  FileText,
} from "lucide-react";

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
  // Already returned by /api/suspects/[key] (lib/graph/enrich.ts dossier())
  // but never wired up in this panel until now.
  firs: { fir_no: string; title: string; category: string; year: number }[];
  bankAccounts: { bank: string; acct: string }[];
  verifiedAddress: string;
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

  // Zoom/pan: contents render inside a <g transform> whose translate/scale
  // this state drives, independent of the fixed 1000x620 viewBox — wheel to
  // zoom (toward the cursor), drag empty canvas to pan, buttons for
  // discoverability since a scroll gesture alone is easy to miss.
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const VIEW_W = 1000;
  const VIEW_H = 620;

  const [activeClusters, setActiveClusters] = useState<Set<string>>(new Set());
  const [expandedFir, setExpandedFir] = useState<string | null>(null);

  const jumpToContact = (name: string) => {
    const n = data?.nodes.find((x) => x.name === name);
    if (!n) return;
    select(n);
    centerOnNode(n);
  };
  const toggleCluster = (c: string) => {
    setActiveClusters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/network")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setPositions(forceLayout(d.nodes, d.edges));
      });
  }, []);

  // Screen (client) coords -> the SVG's own 1000x620 viewBox coords.
  const toViewBoxPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((clientX - rect.left) / rect.width) * VIEW_W, y: ((clientY - rect.top) / rect.height) * VIEW_H };
  };

  const zoomBy = (factor: number, center?: { x: number; y: number }) => {
    setView((v) => {
      const nextScale = Math.min(4, Math.max(0.4, v.scale * factor));
      const c = center ?? { x: VIEW_W / 2, y: VIEW_H / 2 };
      // keep the point under `center` fixed on screen while scale changes
      const worldX = (c.x - v.x) / v.scale;
      const worldY = (c.y - v.y) / v.scale;
      return { scale: nextScale, x: c.x - worldX * nextScale, y: c.y - worldY * nextScale };
    });
  };

  const resetView = () => setView({ x: 0, y: 0, scale: 1 });

  const centerOnNode = (n: GraphNode) => {
    const p = positions.get(n.id);
    if (!p) return;
    setView((v) => {
      const scale = Math.max(v.scale, 1.4);
      return { scale, x: VIEW_W / 2 - p.x * scale, y: VIEW_H / 2 - p.y * scale };
    });
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const center = toViewBoxPoint(e.clientX, e.clientY);
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, center);
  };

  const backgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setPanning(true);
    panRef.current = { x: e.clientX, y: e.clientY };
  };
  const backgroundPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panning && panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    pointerMove(e);
  };
  const backgroundPointerUp = () => {
    setPanning(false);
    panRef.current = null;
    pointerUp();
  };

  const bMax = useMemo(
    () => (data ? Math.max(...data.nodes.map((n) => data.metrics[n.id]?.betweenness ?? 0), 0.0001) : 1),
    [data],
  );

  const radiusOf = (n: GraphNode) => 7 + 13 * ((data?.metrics[n.id]?.betweenness ?? 0) / bMax);

  const select = async (n: GraphNode) => {
    setSelected(n);
    setDossier(null);
    setExpandedFir(null);
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
    e.stopPropagation(); // don't also start a background pan
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
    const rect = svgRef.current?.getBoundingClientRect();
    // viewBox-units per screen-pixel, adjusted for the current zoom level —
    // without dividing by view.scale, dragging a zoomed-in node would fling
    // it far past the cursor.
    const pxToViewBox = rect ? VIEW_W / rect.width / view.scale : 1;
    setPositions((prev) => {
      const next = new Map(prev);
      const p = next.get(dragId)!;
      next.set(dragId, { x: p.x + dx * pxToViewBox, y: p.y + dy * pxToViewBox });
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-neutral-100 px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Graph</p>
            {Object.entries(CLUSTER_COLOR)
              .filter(([c]) => data?.nodes.some((n) => n.cluster === c))
              .map(([c, color]) => {
                const active = activeClusters.has(c);
                const noneActive = activeClusters.size === 0;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCluster(c)}
                    title={`Filter to “${c}” cluster — click again to clear`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                      active
                        ? "border-neutral-950 bg-neutral-950 text-white"
                        : noneActive
                          ? "border-transparent text-neutral-500 hover:bg-neutral-50"
                          : "border-transparent text-neutral-300 hover:bg-neutral-50 hover:text-neutral-600",
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: active ? "#fff" : color }} />
                    {c}
                  </button>
                );
              })}
            {activeClusters.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveClusters(new Set())}
                className="rounded-full px-2 py-1 text-[11px] font-medium text-neutral-400 underline decoration-dotted hover:text-neutral-700"
              >
                clear filter
              </button>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
                <GitBranch className="size-3.5" />
                {data ? `${data.nodes.length} nodes · ${data.edges.length} links` : "…"}
              </span>
              <span className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-0.5">
                <button type="button" onClick={() => zoomBy(1 / 1.25)} title="Zoom out" className="flex size-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                  <ZoomOut className="size-3.5" />
                </button>
                <button type="button" onClick={resetView} title="Reset view" className="flex size-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                  <Maximize2 className="size-3.5" />
                </button>
                <button type="button" onClick={() => zoomBy(1.25)} title="Zoom in" className="flex size-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
                  <ZoomIn className="size-3.5" />
                </button>
              </span>
            </span>
          </div>

          <div className="relative h-[62vh] min-h-[420px] w-full touch-none select-none">
            {!data ? (
              <div className="flex h-full items-center justify-center gap-2 text-[13px] text-neutral-400">
                <Loader2 className="size-4 animate-spin" /> Building graph…
              </div>
            ) : (
              <svg
                ref={svgRef}
                viewBox="0 0 1000 620"
                preserveAspectRatio="xMidYMid meet"
                className={cn("h-full w-full", panning ? "cursor-grabbing" : "cursor-grab")}
                onWheel={onWheel}
                onPointerDown={backgroundPointerDown}
                onPointerMove={backgroundPointerMove}
                onPointerUp={backgroundPointerUp}
                onPointerLeave={backgroundPointerUp}
              >
                <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
                {data.edges.map((e, i) => {
                  const a = positions.get(e.source);
                  const b = positions.get(e.target);
                  if (!a || !b) return null;
                  const w = e.weight / Math.max(...data.edges.map((x) => x.weight), 1);
                  const srcNode = data.nodes.find((n) => n.id === e.source);
                  const tgtNode = data.nodes.find((n) => n.id === e.target);
                  const dimmed =
                    activeClusters.size > 0 &&
                    !(srcNode && activeClusters.has(srcNode.cluster)) &&
                    !(tgtNode && activeClusters.has(tgtNode.cluster));
                  return (
                    <line
                      key={i}
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="#8b8b94"
                      strokeWidth={0.7 + w * 2.4}
                      strokeOpacity={dimmed ? 0.04 : 0.12 + w * 0.5}
                    />
                  );
                })}
                {data.nodes.map((n) => {
                  const p = positions.get(n.id);
                  if (!p) return null;
                  const r = radiusOf(n);
                  const color = n.type === "burner" ? "#dc2626" : CLUSTER_COLOR[n.cluster] ?? "#9ca3af";
                  const isSel = selected?.id === n.id;
                  const dimmed = activeClusters.size > 0 && !activeClusters.has(n.cluster);
                  const label =
                    (data.metrics[n.id]?.betweenness ?? 0) / bMax > 0.1 || n.firCount > 0 || n.type === "burner";
                  return (
                    <g
                      key={n.id}
                      onPointerDown={(e) => pointerDown(e, n)}
                      className="cursor-pointer"
                      opacity={dimmed ? 0.16 : 1}
                    >
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
                </g>
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
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      Top contacts <span className="normal-case text-neutral-300">· click to jump to them in the graph</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {dossier.topContacts.slice(0, 6).map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => jumpToContact(c.name)}
                          className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-neutral-950 hover:text-neutral-950"
                        >
                          {c.name}
                          <span className="ml-1 tabular-nums text-neutral-400">{c.calls}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {dossier && dossier.money.txns > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Financial activity</p>
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                          ₹{dossier.money.inflow.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Inflow</p>
                      </div>
                      <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                          ₹{dossier.money.outflow.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Outflow</p>
                      </div>
                      <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                          {dossier.money.txns}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Txns</p>
                      </div>
                    </div>
                  </div>
                )}

                {dossier && dossier.firs.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      Linked FIRs <span className="normal-case text-neutral-300">· click for details</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {dossier.firs.map((f) => (
                        <button
                          key={f.fir_no}
                          type="button"
                          onClick={() => setExpandedFir((cur) => (cur === f.fir_no ? null : f.fir_no))}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            expandedFir === f.fir_no
                              ? "border-neutral-950 bg-neutral-950 text-white"
                              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-950 hover:text-neutral-950",
                          )}
                        >
                          <FileText className="size-3" />
                          {f.fir_no}
                        </button>
                      ))}
                    </div>
                    {expandedFir && (
                      (() => {
                        const f = dossier.firs.find((x) => x.fir_no === expandedFir);
                        if (!f) return null;
                        return (
                          <div className="mt-2 rounded-2xl bg-neutral-50 px-3.5 py-3 text-[11.5px] leading-[1.6] text-neutral-600">
                            <p className="font-semibold text-neutral-900">{f.title}</p>
                            <p className="mt-0.5 text-neutral-400">{f.category} · {f.year}</p>
                            <Link href="/evidence" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-950 hover:underline">
                              View in evidence chain <ArrowUpRight className="size-3" />
                            </Link>
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}

                {dossier && dossier.bankAccounts.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Bank accounts</p>
                    <div className="space-y-1.5">
                      {dossier.bankAccounts.map((b, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-2.5 py-1.5 text-[11.5px] text-neutral-600">
                          <Landmark className="size-3.5 text-neutral-400" />
                          <span className="font-medium text-neutral-800">{b.bank}</span>
                          <span className="ml-auto flex items-center gap-1 tabular-nums text-neutral-400">
                            <CreditCard className="size-3" />
                            {b.acct}
                          </span>
                        </div>
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