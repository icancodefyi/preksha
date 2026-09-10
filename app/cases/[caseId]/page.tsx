"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import { forceLayout } from "@/lib/graph/layout";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import {
  Loader2,
  Scale,
  AlertCircle,
  Play,
  FileText,
  Users,
  Network as NetworkIcon,
  ShieldCheck,
  Phone,
  MapPin,
  Crown,
  ArrowUpRight,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  MessagesSquare,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";

// ── Shared shapes (mirroring the global pages' API contracts) ──────────────
interface Accused {
  name: string | null;
  alias: string;
  description: string;
  status: string;
}
interface FirLite {
  idx: number;
  fir_no: string;
  year: number;
  police_station: string;
  incident_date: string;
  title: string;
  category: string;
  sections: string[];
  related_firs: number[];
  accused: Accused[];
}
interface ReconStep {
  phase: string;
  title: string;
  source: string;
  time: string;
}
interface Recon {
  fir: FirLite;
  steps: ReconStep[];
  summary: string;
}
interface SuspectRow {
  key: string;
  name: string;
  alias: string;
  role: string;
  cluster: string;
  city: string;
  phone: string;
  risk: number;
  firCount: number;
  degree: number;
  betweenness: number;
  isKingpin: boolean;
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
interface CaseDetail {
  id: string;
  title: string;
  categories: string[];
  firCount: number;
  suspectCount: number;
  dateRange: { first: string; last: string };
  firs: FirLite[];
  suspectKeys: string[];
  suspects: SuspectRow[];
  activity: { firCount: number; callCount: number; towerHitCount: number };
}
interface EvidenceItem {
  id: string;
  label: string;
  sha256: string;
  verified: boolean;
}
interface GraphNode {
  id: string;
  key: string;
  name: string;
  cluster: string;
  type: "member" | "burner";
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
  metrics: Record<string, { betweenness: number; pagerank: number; degree: number }>;
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
const PHASE_COLOR: Record<string, string> = {
  Premeditation: "#8b5cf6",
  "Money movement": "#0d7abf",
  Offense: "#d9562b",
  "Presence evidence": "#0d7abf",
  "Escape / coordination": "#c98a2b",
  Settlement: "#2f7c53",
};

type Tab = "files" | "suspects" | "evidence" | "network";
const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "files", label: "Files", icon: FileText },
  { id: "suspects", label: "Suspects", icon: Users },
  { id: "evidence", label: "Evidence", icon: ShieldCheck },
  { id: "network", label: "Network", icon: NetworkIcon },
];

export default function CaseWorkspacePage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;
  const [kase, setKase] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState<Tab>("files");

  useEffect(() => {
    fetch(`/api/cases/${caseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setKase);
  }, [caseId]);

  if (!kase) {
    return (
      <WsShell title="Loading case…">
        <p className="flex items-center gap-2 px-1 py-6 text-[12.5px] text-neutral-400">
          <Loader2 className="size-3.5 animate-spin" /> Loading case…
        </p>
      </WsShell>
    );
  }

  return (
    <WsShell
      title={kase.title}
      sub={`${kase.firCount} FIRs · ${kase.suspectCount} suspects · ${kase.dateRange.first} → ${kase.dateRange.last}`}
      right={
        <Link
          href={`/ask?case=${kase.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800"
        >
          <MessagesSquare className="size-3.5" />
          Chat with case
        </Link>
      }
    >
      <div className="mb-4 flex gap-1.5 rounded-2xl border border-neutral-200/80 bg-white p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors",
              tab === t.id ? "bg-neutral-950 text-white" : "text-neutral-500 hover:bg-neutral-50",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "files" && <FilesTab kase={kase} />}
      {tab === "suspects" && <SuspectsTab kase={kase} />}
      {tab === "evidence" && <EvidenceTab kase={kase} />}
      {tab === "network" && <NetworkTab kase={kase} />}
    </WsShell>
  );
}

// ── Files tab — FIR list + reconstruction, scoped to this case ─────────────
function FilesTab({ kase }: { kase: CaseDetail }) {
  const [selected, setSelected] = useState<FirLite | null>(null);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [loading, setLoading] = useState(false);

  const openFir = async (f: FirLite) => {
    setSelected(f);
    setRecon(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/firs/${f.idx}`);
      if (r.ok) setRecon(await r.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <ActivityCard label="FIRs in case" value={kase.activity.firCount} />
        <ActivityCard label="CDR calls involving suspects" value={kase.activity.callCount} />
        <ActivityCard label="Tower-dump hits" value={kase.activity.towerHitCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="rounded-3xl border border-neutral-200/80 bg-white lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
          <div className="border-b border-neutral-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">FIRs in this case</p>
          </div>
          <div className="space-y-1 p-2.5">
            {kase.firs.map((f) => (
              <button
                key={f.idx}
                onClick={() => openFir(f)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-2xl px-3.5 py-3 text-left transition-colors",
                  selected?.idx === f.idx ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-semibold tracking-[-0.01em] text-neutral-900">FIR {f.fir_no}</span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-400">{f.category}</span>
                </div>
                <p className="truncate text-[13px] text-neutral-600">{f.title}</p>
                <p className="text-[11px] tabular-nums text-neutral-400">{f.incident_date} · {f.police_station}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200/80 bg-white">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center px-8 py-24 text-center">
              <Scale className="size-8 text-neutral-200" />
              <p className="mt-4 max-w-xs text-[13.5px] leading-[1.6] text-neutral-500">
                Select an FIR to rebuild its timeline from CDR, tower dump and financial records.
              </p>
            </div>
          ) : (
            <div className="px-6 py-6">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-white">FIR {selected.fir_no}</span>
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-400">{selected.category}</span>
                {selected.idx === 4 && (
                  <Link href="/simulate?fir=4" className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-neutral-800">
                    <Play className="size-3" /> Replay in 3D
                  </Link>
                )}
              </div>
              <h2 className="mt-3 text-[22px] font-medium leading-tight tracking-[-0.02em] text-neutral-950">{selected.title}</h2>
              <p className="mt-1 text-[12px] tabular-nums text-neutral-400">
                {selected.incident_date} · {selected.police_station} · {selected.sections.join(", ")}
              </p>

              {selected.accused.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Accused</span>
                  {selected.accused.map((a, i) => (
                    <span key={i} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600" title={a.description}>
                      {a.name ?? a.alias}
                    </span>
                  ))}
                </div>
              )}

              <div className="my-6 h-px bg-neutral-100" />

              {loading ? (
                <div className="flex items-center gap-2 py-10 text-[13px] text-neutral-400">
                  <Loader2 className="size-4 animate-spin" /> Rebuilding timeline…
                </div>
              ) : recon ? (
                <>
                  <p className="mb-6 max-w-2xl text-[14px] leading-[1.6] text-neutral-600">{recon.summary}</p>
                  <div className="relative space-y-0 border-l border-neutral-200 pl-6">
                    {recon.steps.map((s, i) => (
                      <div key={i} className="relative pb-6">
                        <span className="absolute -left-[31px] top-1 size-3 rounded-full ring-4 ring-white" style={{ backgroundColor: PHASE_COLOR[s.phase] ?? "#9ca3af" }} />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-600">{s.phase}</span>
                          <span className="text-[10.5px] tabular-nums text-neutral-400">{s.time}</span>
                        </div>
                        <p className="mt-1.5 text-[13.5px] font-medium leading-[1.5] text-neutral-900">{s.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-400"><AlertCircle className="size-3" /> source: {s.source}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-10 text-[13px] text-neutral-400">No reconstruction available.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white px-4 py-3.5">
      <p className="text-[20px] font-medium tabular-nums leading-none tracking-[-0.03em] text-neutral-950">{value.toLocaleString()}</p>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{label}</p>
    </div>
  );
}

// ── Suspects tab — case-filtered list + dossier ─────────────────────────────
function SuspectsTab({ kase }: { kase: CaseDetail }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async (key: string) => {
    setSelectedKey(key);
    setDossier(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/suspects/${key}`);
      if (r.ok) setDossier(await r.json());
    } finally {
      setLoading(false);
    }
  };

  if (kase.suspects.length === 0) {
    return <p className="rounded-3xl border border-neutral-200/80 bg-white px-6 py-16 text-center text-[13px] text-neutral-400">No suspects resolved for this case yet.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="rounded-3xl border border-neutral-200/80 bg-white lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
        <div className="border-b border-neutral-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Suspects in this case</p>
        </div>
        <div className="space-y-1 p-2.5">
          {kase.suspects.map((r) => (
            <button
              key={r.key}
              onClick={() => open(r.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors",
                selectedKey === r.key ? "bg-neutral-100" : "hover:bg-neutral-50",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white" style={{ backgroundColor: CLUSTER_COLOR[r.cluster] ?? "#9ca3af" }}>
                {r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] text-neutral-900">
                  {r.name}
                  {r.isKingpin && <Crown className="size-3.5 text-[#c98a2b]" />}
                </span>
                <span className="block truncate text-[11px] text-neutral-400">{r.role} · {r.cluster} · {r.firCount} FIRs</span>
              </span>
              <span className="text-[15px] font-semibold tabular-nums tracking-[-0.02em] text-neutral-950">{r.risk}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200/80 bg-white">
        {!selectedKey ? (
          <div className="flex h-full flex-col items-center justify-center px-8 py-24 text-center">
            <Phone className="size-8 text-neutral-200" />
            <p className="mt-4 max-w-xs text-[13.5px] leading-[1.6] text-neutral-500">Select a suspect for the full dossier.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 px-8 py-16 text-[13px] text-neutral-400"><Loader2 className="size-4 animate-spin" /> Reading dossier…</div>
        ) : dossier ? (
          <div className="px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white" style={{ backgroundColor: CLUSTER_COLOR[dossier.cluster] ?? "#9ca3af" }}>{dossier.cluster}</span>
                  <span className="text-[11px] text-neutral-400">{dossier.role}</span>
                </div>
                <h2 className="mt-2.5 text-[24px] font-medium leading-tight tracking-[-0.025em] text-neutral-950">
                  {dossier.name}{dossier.alias ? <span className="text-neutral-400"> · &ldquo;{dossier.alias}&rdquo;</span> : null}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-neutral-500">
                  <span className="flex items-center gap-1"><Phone className="size-3" /> {dossier.phone}</span>
                  <span className="flex items-center gap-1"><MapPin className="size-3" /> {dossier.city}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">Risk</p>
                <p className="mt-1 text-[32px] font-medium tabular-nums leading-none tracking-[-0.03em] text-neutral-950">{dossier.risk}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2.5">
              <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">₹{dossier.money.inflow.toLocaleString("en-IN")}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Inflow</p>
              </div>
              <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">₹{dossier.money.outflow.toLocaleString("en-IN")}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Outflow</p>
              </div>
              <div className="flex-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                <p className="text-[15px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">{dossier.firCount}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">FIRs</p>
              </div>
            </div>

            {dossier.topContacts.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Top contacts</p>
                <div className="flex flex-wrap gap-1.5">
                  {dossier.topContacts.slice(0, 6).map((c, i) => (
                    <span key={i} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600">{c.name}<span className="ml-1 tabular-nums text-neutral-400">{c.calls}</span></span>
                  ))}
                </div>
              </div>
            )}

            <Link href={`/suspects?focus=${dossier.name}`} className="group mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-neutral-950">
              Open in global suspect view
              <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        ) : (
          <p className="px-8 py-16 text-[13px] text-neutral-400">Dossier not found.</p>
        )}
      </div>
    </div>
  );
}

// ── Evidence tab — case-filtered chain (FIRs in scope + dataset rollups) ───
function EvidenceTab({ kase }: { kase: CaseDetail }) {
  const [chain, setChain] = useState<EvidenceItem[] | null>(null);
  const [root, setRoot] = useState<string>("");

  useEffect(() => {
    fetch("/api/evidence").then((r) => r.json()).then((d) => {
      setChain(d.chain);
      setRoot(d.root);
    });
  }, []);

  const caseFirNos = useMemo(() => new Set(kase.firs.map((f) => f.fir_no)), [kase]);
  const filtered = chain?.filter((c) => caseFirNos.has(c.id) || ["CDR", "FIN", "DUMP"].includes(c.id));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {!filtered ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-neutral-200 bg-white px-6 py-16 text-[13px] text-neutral-400"><Loader2 className="size-4 animate-spin" /> Hashing evidence…</div>
      ) : (
        <div className="rounded-3xl border border-neutral-200/80 bg-white px-6 py-6">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            {filtered.length} artifact{filtered.length === 1 ? "" : "s"} for this case
          </p>
          <div className="space-y-0">
            {filtered.map((item, i) => (
              <div key={item.id}>
                <Link href={`/ask?q=${encodeURIComponent(`Tell me about ${item.id}`)}`} className="group flex items-center gap-4 rounded-2xl py-3 pr-2 transition-colors hover:bg-neutral-50">
                  <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", item.verified ? "bg-neutral-100 text-neutral-600" : "bg-[#c64e27]/10 text-[#c64e27]")}>
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.01em] text-neutral-900">
                      {item.label}
                      {item.verified ? <CheckCircle2 className="size-3.5 text-[#359462]" /> : <AlertTriangle className="size-3.5 text-[#c64e27]" />}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10.5px] tabular-nums text-neutral-400">{item.sha256}</p>
                  </div>
                  <ArrowUpRight className="size-3.5 shrink-0 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
                {i < filtered.length - 1 && <div className="ml-[17px] h-px w-px border-l border-dashed border-neutral-200" />}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-neutral-950 px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400"><Fingerprint className="size-3" /> Corpus root — SHA-256</p>
            <p className="mt-1.5 break-all font-mono text-[11.5px] tabular-nums text-neutral-300">{root}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Network tab — subgraph for this case's suspects (1-hop context) ────────
function NetworkTab({ kase }: { kase: CaseDetail }) {
  const [data, setData] = useState<NetworkData | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  // Node positions are STATE, not a derived memo — dragging mutates this
  // map directly. A memo would be recreated (and the drag lost) on every
  // unrelated re-render; this mirrors app/network/page.tsx's proven pattern.
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Stable across renders (only changes if kase.suspectKeys does) — runs
  // both inside useMemo (render) and directly in the fetch callback below
  // (to seed positions without a second effect calling setState in its body).
  const deriveSubgraph = useCallback(
    (raw: NetworkData | null): { nodes: GraphNode[]; edges: GraphEdge[] } => {
      if (!raw) return { nodes: [], edges: [] };
      const core = new Set(kase.suspectKeys);
      const coreIds = new Set(raw.nodes.filter((n) => core.has(n.key)).map((n) => n.id));
      const touchingCore = raw.edges.filter((e) => coreIds.has(e.source) || coreIds.has(e.target));
      const visibleIds = new Set<string>(coreIds);
      for (const e of touchingCore) {
        visibleIds.add(e.source);
        visibleIds.add(e.target);
      }
      return { nodes: raw.nodes.filter((n) => visibleIds.has(n.id)), edges: touchingCore };
    },
    [kase.suspectKeys],
  );

  useEffect(() => {
    fetch("/api/network")
      .then((r) => r.json())
      .then((raw: NetworkData) => {
        setData(raw);
        const sub = deriveSubgraph(raw);
        setPositions(forceLayout(sub.nodes, sub.edges));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { nodes, edges } = useMemo(() => deriveSubgraph(data), [data, deriveSubgraph]);

  const select = async (n: GraphNode) => {
    setSelected(n);
    setDossier(null);
    const r = await fetch(`/api/suspects/${n.key}`);
    if (r.ok) setDossier(await r.json());
  };

  const zoomBy = (factor: number, center?: { x: number; y: number }) => {
    setView((v) => {
      const nextScale = Math.min(4, Math.max(0.4, v.scale * factor));
      const c = center ?? { x: 500, y: 310 };
      const worldX = (c.x - v.x) / v.scale;
      const worldY = (c.y - v.y) / v.scale;
      return { scale: nextScale, x: c.x - worldX * nextScale, y: c.y - worldY * nextScale };
    });
  };
  const resetView = () => setView({ x: 0, y: 0, scale: 1 });
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const center = rect ? { x: ((e.clientX - rect.left) / rect.width) * 1000, y: ((e.clientY - rect.top) / rect.height) * 620 } : undefined;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, center);
  };

  // Node drag: stops propagation so a node click never also starts a
  // background pan on the same pointer-down (that fight was why clicks felt
  // broken before this fix).
  const nodePointerDown = (e: React.PointerEvent, n: GraphNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(n);
    setDragId(n.id);
    dragRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const bgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setPanning(true);
    panRef.current = { x: e.clientX, y: e.clientY };
  };
  const bgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragId && dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current = { x: e.clientX, y: e.clientY };
      const rect = svgRef.current?.getBoundingClientRect();
      const pxToViewBox = rect ? 1000 / rect.width / view.scale : 1;
      setPositions((prev) => {
        const next = new Map(prev);
        const p = next.get(dragId)!;
        next.set(dragId, { x: p.x + dx * pxToViewBox, y: p.y + dy * pxToViewBox });
        return next;
      });
      return;
    }
    if (!panning || !panRef.current) return;
    const dx = e.clientX - panRef.current.x;
    const dy = e.clientY - panRef.current.y;
    panRef.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const bgPointerUp = () => {
    setPanning(false);
    panRef.current = null;
    setDragId(null);
    dragRef.current = null;
  };

  if (!data) {
    return <div className="flex h-64 items-center justify-center gap-2 rounded-3xl border border-neutral-200 bg-white text-[13px] text-neutral-400"><Loader2 className="size-4 animate-spin" /> Building graph…</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200/80 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Case subgraph</p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-neutral-400">{nodes.length} nodes · {edges.length} links (1-hop from case suspects)</span>
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
          </div>
        </div>
        <div className="relative h-[56vh] min-h-[380px] w-full">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 620"
            preserveAspectRatio="xMidYMid meet"
            className={cn("h-full w-full", panning ? "cursor-grabbing" : "cursor-grab")}
            onWheel={onWheel}
            onPointerDown={bgPointerDown}
            onPointerMove={bgPointerMove}
            onPointerUp={bgPointerUp}
            onPointerLeave={bgPointerUp}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              <GraphCanvas
                edges={edges.flatMap((e, i) => {
                  const a = positions.get(e.source);
                  const b = positions.get(e.target);
                  if (!a || !b) return [];
                  return [{ id: String(i), x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: 0.7 + Math.min(e.calls, 20) * 0.08, opacity: 0.28 }];
                })}
                nodes={nodes.flatMap((n) => {
                  const p = positions.get(n.id);
                  if (!p) return [];
                  const inCase = kase.suspectKeys.includes(n.key);
                  const color = n.type === "burner" ? "#dc2626" : CLUSTER_COLOR[n.cluster] ?? "#9ca3af";
                  return [{
                    id: n.id,
                    x: p.x,
                    y: p.y,
                    radius: inCase ? 12 : 8,
                    color,
                    label: n.name,
                    dimmed: !inCase,
                    selected: selected?.id === n.id,
                    bold: inCase,
                    burner: n.type === "burner",
                    onPointerDown: (e) => nodePointerDown(e, n),
                  }];
                })}
              />
            </g>
          </svg>
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200/80 bg-white">
        <div className="border-b border-neutral-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{selected ? "Node" : "Select a node"}</p>
        </div>
        {!selected ? (
          <p className="px-5 py-10 text-center text-[12.5px] leading-[1.6] text-neutral-400">
            Bold nodes are this case&apos;s suspects; dim nodes are their 1-hop contacts (other clusters, burners) shown for context.
          </p>
        ) : dossier ? (
          <div className="px-5 py-5">
            <h3 className="text-[16px] font-medium text-neutral-950">{dossier.name}</h3>
            <p className="mt-0.5 text-[12px] text-neutral-500">{dossier.role} · {dossier.city}</p>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex-1 rounded-2xl bg-neutral-50 px-3 py-2.5">
                <p className="text-[15px] font-medium tabular-nums text-neutral-950">{dossier.risk}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-neutral-400">Risk</p>
              </div>
              <div className="flex-1 rounded-2xl bg-neutral-50 px-3 py-2.5">
                <p className="text-[15px] font-medium tabular-nums text-neutral-950">{dossier.firCount}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-neutral-400">FIRs</p>
              </div>
            </div>
            <Link href={`/network?focus=${dossier.name}`} className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-neutral-950">
              Open in global network <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-[12.5px] text-neutral-400"><Loader2 className="size-4 animate-spin mx-auto" /></div>
        )}
      </div>
    </div>
  );
}
