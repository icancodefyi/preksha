"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import { forceLayout } from "@/lib/graph/layout";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { useI18n } from "@/lib/i18n";
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
  RotateCcw,
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
  trafficking: "#be123c",
  arms: "#334155",
  counterfeit: "#0d9488",
  extortion: "#a16207",
  unknown: "#9ca3af",
};

// forceLayout moved to lib/graph/layout.ts — shared with the per-case
// network tab (app/cases/[caseId]/page.tsx) so both use the same physics.

export default function NetworkPage() {
  return (
    <Suspense fallback={null}>
      <NetworkPageInner />
    </Suspense>
  );
}

function NetworkPageInner() {
  const { t } = useI18n();
  const [data, setData] = useState<NetworkData | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [simTarget, setSimTarget] = useState<string>("");
  // Cumulative "removed" people for the disruption simulator — a Set so
  // multiple people can be taken out at once, each individually restorable.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [sim, setSim] = useState<{
    removedNames: string[];
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

  const centerOnNode = (n: GraphNode) => {
    const p = positions.get(n.id);
    if (!p) return;
    setView((v) => {
      const scale = Math.max(v.scale, 1.4);
      return { scale, x: VIEW_W / 2 - p.x * scale, y: VIEW_H / 2 - p.y * scale };
    });
  };

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

  const searchParams = useSearchParams();
  // A ref, not state: this only gates a one-time action inside an effect
  // and must never itself trigger a re-render (that pattern — setState
  // synchronously inside an effect body — causes an avoidable cascading
  // render; a ref mutation does not).
  const focusedFromUrlRef = useRef(false);

  useEffect(() => {
    fetch("/api/network")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setPositions(forceLayout(d.nodes, d.edges));
      });
  }, []);

  // Cross-page navigation target: /network?focus=<key> (from Suspects'
  // "Locate in graph" button) — select and center that node once the graph
  // has finished laying out, exactly once per page load.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || !data || focusedFromUrlRef.current || positions.size === 0) return;
    const node = data.nodes.find((n) => n.key === focus);
    focusedFromUrlRef.current = true;
    if (!node) return;
    // Deferred a tick: select()/centerOnNode() setState synchronously, and
    // react-hooks/set-state-in-effect flags that even through a function
    // call — queueMicrotask moves it out of the effect's own call stack.
    queueMicrotask(() => {
      select(node);
      centerOnNode(node);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, positions, searchParams]);

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

  const visibleEdgeCount = useMemo(() => {
    if (!data) return 0;
    if (removedKeys.size === 0) return data.edges.length;
    const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
    return data.edges.filter((e) => {
      const s = nodeById.get(e.source);
      const t = nodeById.get(e.target);
      return !(s && removedKeys.has(s.key)) && !(t && removedKeys.has(t.key));
    }).length;
  }, [data, removedKeys]);


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

  const runSimulationFor = async (keys: Set<string>) => {
    if (keys.size === 0) {
      setSim(null);
      return;
    }
    setSimLoading(true);
    try {
      const r = await fetch(`/api/network?remove=${[...keys].join(",")}`);
      const d = await r.json();
      setSim(d.disruption);
    } finally {
      setSimLoading(false);
    }
  };

  // "Remove" — adds the picked suspect to the cumulative removal set, drops
  // them out of the rendered graph, and re-runs the fragmentation stats
  // across everyone removed so far.
  const removeFromNetwork = async (key: string) => {
    if (!key || removedKeys.has(key)) return;
    const next = new Set(removedKeys);
    next.add(key);
    setRemovedKeys(next);
    setSimTarget("");
    if (selected?.key === key) setSelected(null);
    await runSimulationFor(next);
  };

  // "Add back" — restores one previously-removed person and refreshes the
  // stats against whoever is still removed.
  const restoreToNetwork = async (key: string) => {
    const next = new Set(removedKeys);
    next.delete(key);
    setRemovedKeys(next);
    await runSimulationFor(next);
  };

  return (
    <WsShell
      title={t("net.title")}
      sub={t("net.sub")}
      right={
        <span className="hidden items-center gap-2 text-[11px] font-medium text-neutral-400 sm:flex">
          <Grip className="size-3.5" />
          {t("net.dragHint")}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Graph canvas */}
        <div className="relative overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(16,15,25,0.04),0_12px_32px_-12px_rgba(16,15,25,0.10)]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-neutral-100 px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{t("net.graph")}</p>
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
                {t("net.clearFilter")}
              </button>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
                <GitBranch className="size-3.5" />
                {data
                  ? `${data.nodes.length - removedKeys.size} ${t("net.nodes")} · ${visibleEdgeCount} ${t("net.links")}${
                      removedKeys.size > 0 ? ` · ${removedKeys.size} ${t("net.removed")}` : ""
                    }`
                  : "…"}
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
                <Loader2 className="size-4 animate-spin" /> {t("net.building")}
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
                  <GraphCanvas
                    edges={data.edges.flatMap((e, i) => {
                      const a = positions.get(e.source);
                      const b = positions.get(e.target);
                      if (!a || !b) return [];
                      const srcNode = data.nodes.find((n) => n.id === e.source);
                      const tgtNode = data.nodes.find((n) => n.id === e.target);
                      if ((srcNode && removedKeys.has(srcNode.key)) || (tgtNode && removedKeys.has(tgtNode.key))) return [];
                      const w = e.weight / Math.max(...data.edges.map((x) => x.weight), 1);
                      const dimmed =
                        activeClusters.size > 0 &&
                        !(srcNode && activeClusters.has(srcNode.cluster)) &&
                        !(tgtNode && activeClusters.has(tgtNode.cluster));
                      return [{ id: String(i), x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: 0.7 + w * 2.4, opacity: dimmed ? 0.04 : 0.12 + w * 0.5 }];
                    })}
                    nodes={data.nodes.flatMap((n) => {
                      if (removedKeys.has(n.key)) return [];
                      const p = positions.get(n.id);
                      if (!p) return [];
                      const r = radiusOf(n);
                      const color = n.type === "burner" ? "#dc2626" : CLUSTER_COLOR[n.cluster] ?? "#9ca3af";
                      const isSel = selected?.id === n.id;
                      const dimmed = activeClusters.size > 0 && !activeClusters.has(n.cluster);
                      const showLabel =
                        (data.metrics[n.id]?.betweenness ?? 0) / bMax > 0.1 || n.firCount > 0 || n.type === "burner";
                      return [{
                        id: n.id,
                        x: p.x,
                        y: p.y,
                        radius: r,
                        color,
                        label: showLabel ? n.name : "",
                        dimmed,
                        selected: isSel,
                        burner: n.type === "burner",
                        onPointerDown: (e) => pointerDown(e, n),
                      }];
                    })}
                  />
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
                {dossierLoading ? t("common.loading") : selected ? t("net.nodeDossier") : t("net.selectNode")}
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
                      {selected.type === "burner" ? " · " + t("net.burnedSim") : ""}
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
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{t("net.riskPer100")}</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                      <p className="text-[17px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                        {Math.round(dossier.metrics.betweenness * 100) / 100}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{t("net.betweenness")}</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                      <p className="text-[17px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                        {dossier.firCount}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{t("net.firs")}</p>
                    </div>
                  </div>
                )}

                {dossier && dossier.topContacts.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      {t("net.topContacts")} <span className="normal-case text-neutral-300">{t("net.clickJump")}</span>
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
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{t("net.financialActivity")}</p>
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                          ₹{dossier.money.inflow.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{t("net.inflow")}</p>
                      </div>
                      <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                          ₹{dossier.money.outflow.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{t("net.outflow")}</p>
                      </div>
                      <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">
                          {dossier.money.txns}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{t("net.txns")}</p>
                      </div>
                    </div>
                  </div>
                )}

                {dossier && dossier.firs.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                      {t("net.linkedFirs")} <span className="normal-case text-neutral-300">{t("net.clickDetails")}</span>
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
                              {t("net.viewEvidence")} <ArrowUpRight className="size-3" />
                            </Link>
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}

                {dossier && dossier.bankAccounts.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{t("net.bankAccounts")}</p>
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
                  href={`/suspects?focus=${encodeURIComponent(selected.name)}`}
                  className="group mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-neutral-950"
                >
                  {t("net.openDossier")}
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-[12.5px] leading-[1.6] text-neutral-400">
                {t("net.emptyHint")}
                <div className="mt-5 rounded-2xl bg-neutral-50 px-4 py-3 text-left text-[11px] text-neutral-500">
                  <p className="mb-1 font-semibold text-neutral-700">{t("net.readGraph")}</p>
                  <p>{t("net.readGraphDesc")}</p>
                </div>
              </div>
            )}
          </div>

          {/* Disruption simulator */}
          <div className="rounded-3xl border border-neutral-200/80 bg-white">
            <div className="border-b border-neutral-100 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{t("net.disruptionSim")}</p>
              <p className="mt-1 text-[11px] leading-[1.5] text-neutral-400">
                {t("net.disruptionDesc")}
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex gap-2">
                <select
                  value={simTarget}
                  onChange={(e) => setSimTarget(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-[12.5px] font-medium text-neutral-800 focus:border-neutral-400 focus:outline-none"
                >
                  <option value="">{t("net.removeWhom")}</option>
                  {(data?.disruptionRanking ?? []).map((d) => {
                    const n = data?.nodes.find((x) => x.name === d.name);
                    if (!n || removedKeys.has(n.key)) return null;
                    return (
                      <option key={n.key} value={n.key}>
                        {n.name} — {d.fragmentationPct}%
                      </option>
                    );
                  })}
                </select>
                <button
                  onClick={() => removeFromNetwork(simTarget)}
                  disabled={!simTarget || simLoading}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-neutral-950 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  {simLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldX className="size-3.5" />}
                  {t("net.remove")}
                </button>
              </div>

              {removedKeys.size > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[...removedKeys].map((key) => {
                    const n = data?.nodes.find((x) => x.key === key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => restoreToNetwork(key)}
                        title={t("net.addBack")}
                        className="group flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-2.5 pr-2 text-[11px] font-medium text-neutral-500 transition-colors hover:border-[#c64e27]/40 hover:bg-[#c64e27]/5 hover:text-[#c64e27]"
                      >
                        {n?.name ?? key}
                        <RotateCcw className="size-3 text-neutral-400 transition-colors group-hover:text-[#c64e27]" />
                      </button>
                    );
                  })}
                </div>
              )}

              {sim && (
                <div className="overflow-hidden rounded-2xl border border-neutral-200/70">
                  <div className="flex items-center justify-between bg-neutral-50 px-3.5 py-2.5">
                    <span className="text-[12px] font-semibold text-neutral-800">
                      {sim.removedNames.length > 1
                        ? `${sim.removedNames.length} ${t("net.suspectsRemoved")}`
                        : `${sim.removedNames[0]} ${t("net.removed")}`}
                    </span>
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
                      { k: t("net.lccBefore"), v: `${sim.lccSizeBefore} members` },
                      { k: t("net.lccAfter"), v: `${sim.lccSizeAfter} members` },
                      { k: t("net.fragmentsAfter"), v: `${sim.fragmentCountAfter}` },
                      { k: t("net.remainingBridges"), v: sim.remainingBridges.join(", ") || "—" },
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