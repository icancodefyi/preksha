"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import { Loader2, ArrowUpRight, MapPin, Phone, Crown, FileText } from "lucide-react";

interface SuspectRow {
  key: string;
  name: string;
  alias: string | null;
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
  key: string;
  name: string;
  alias: string | null;
  role: string;
  cluster: string;
  city: string;
  known: boolean;
  risk: number;
  firCount: number;
  phone: string;
  // API (lib/graph/enrich.ts dossier()) returns `verifiedAddress`, not
  // `verification` — this field was previously never populated.
  verifiedAddress: string | null;
  metrics: { degree: number; weightedDegree: number; betweenness: number; pagerank: number } | null;
  money: { inflow: number; outflow: number; txns: number };
  topContacts: { key: string; name: string; calls: number }[];
  bankAccounts: { bank: string; acct: string }[];
  firs: { fir_no: string; title: string; category: string; year: number }[];
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

export default function SuspectsPage() {
  const searchParams = useSearchParams();
  const focusedFromUrlRef = useRef(false);
  const [rows, setRows] = useState<SuspectRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/suspects").then((r) => r.json()).then(setRows);
  }, []);

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

  // Cross-page navigation target: /suspects?focus=<name> (from Cases'
  // "Accused" chips, Dashboard's contact chips, etc.) — resolve the name to
  // a row once the list has loaded, then open it like a normal click would.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || rows.length === 0 || focusedFromUrlRef.current) return;
    const match = rows.find((r) => r.name.toLowerCase() === focus.toLowerCase())
      ?? rows.find((r) => r.name.toLowerCase().includes(focus.toLowerCase()));
    focusedFromUrlRef.current = true;
    if (!match) return;
    // Deferred a tick: open() setState synchronously, and
    // react-hooks/set-state-in-effect flags that even through a function
    // call — queueMicrotask moves it out of the effect's own call stack.
    queueMicrotask(() => open(match.key));
  }, [rows, searchParams]);

  return (
    <WsShell title="Suspect rankings" sub="Risk fuses centrality, FIR involvement, burner linkage and money flow">
      <div className="grid gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
        <div className="rounded-3xl border border-neutral-200/80 bg-white lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
          <div className="border-b border-neutral-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Ranked by risk
            </p>
          </div>
          <div className="space-y-1 p-2.5">
            {rows.length === 0 && (
              <p className="flex items-center gap-2 px-3 py-6 text-[12.5px] text-neutral-400">
                <Loader2 className="size-3.5 animate-spin" /> Scoring suspects…
              </p>
            )}
            {rows.map((r, i) => (
              <button
                key={r.key}
                onClick={() => open(r.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors",
                  selectedKey === r.key ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-neutral-400">
                  {i + 1}
                </span>
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                  style={{ backgroundColor: CLUSTER_COLOR[r.cluster] ?? "#9ca3af" }}
                >
                  {r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] text-neutral-900">
                    {r.name}
                    {r.isKingpin && <Crown className="size-3.5 text-[#c98a2b]" />}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-400">
                    {r.role} · {r.cluster} · {r.firCount} FIRs
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[15px] font-semibold tabular-nums tracking-[-0.02em] text-neutral-950">
                    {r.risk}
                  </span>
                  <span className="h-1 w-14 overflow-hidden rounded-full bg-neutral-100">
                    <span
                      className={cn("block h-full rounded-full", r.risk >= 70 ? "bg-[#c64e27]" : r.risk >= 45 ? "bg-[#c98a2b]" : "bg-[#359462]")}
                      style={{ width: `${r.risk}%` }}
                    />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200/80 bg-white">
          {!selectedKey ? (
            <div className="flex h-full flex-col items-center justify-center px-8 py-24 text-center">
              <Phone className="size-8 text-neutral-200" />
              <p className="mt-4 max-w-xs text-[13.5px] leading-[1.6] text-neutral-500">
                Select a suspect for the full dossier — subscriber record, verified address, accounts,
                money flow and cross-FIR history.
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 px-8 py-16 text-[13px] text-neutral-400">
              <Loader2 className="size-4 animate-spin" /> Reading dossier…
            </div>
          ) : dossier ? (
            <div className="px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
                      style={{ backgroundColor: CLUSTER_COLOR[dossier.cluster] ?? "#9ca3af" }}
                    >
                      {dossier.cluster}
                    </span>
                    <span className="text-[11px] text-neutral-400">{dossier.role}</span>
                  </div>
                  <h2 className="mt-2.5 text-[24px] font-medium leading-tight tracking-[-0.025em] text-neutral-950">
                    {dossier.name}
                    {dossier.alias ? <span className="text-neutral-400"> · “{dossier.alias}”</span> : null}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-neutral-500">
                    <span className="flex items-center gap-1"><Phone className="size-3" /> {dossier.phone}</span>
                    <span className="flex items-center gap-1"><MapPin className="size-3" /> {dossier.city}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10.5px] font-medium">
                      {dossier.known ? "subscriber on record" : "no subscriber record"}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">Risk</p>
                  <p className={cn(
                    "mt-1 text-[32px] font-medium tabular-nums leading-none tracking-[-0.03em]",
                    dossier.risk >= 70 ? "text-[#c64e27]" : dossier.risk >= 45 ? "text-[#c98a2b]" : "text-[#2f7c53]",
                  )}>
                    {dossier.risk}
                  </p>
                </div>
              </div>

              {dossier.metrics && (
                <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    { k: "Calls / partners", v: dossier.metrics.weightedDegree },
                    { k: "Direct partners", v: dossier.metrics.degree },
                    { k: "Betweenness", v: Math.round(dossier.metrics.betweenness * 100) / 100 },
                    { k: "PageRank", v: Math.round(dossier.metrics.pagerank * 10000) / 10000 },
                  ].map((m) => (
                    <div key={m.k} className="rounded-2xl bg-neutral-50 px-3.5 py-3">
                      <p className="text-[17px] font-medium tabular-nums leading-none tracking-[-0.02em] text-neutral-950">{m.v}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">{m.k}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="my-6 h-px bg-neutral-100" />

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Money flow</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-2xl border border-neutral-200/70 px-3.5 py-2.5">
                      <span className="text-[12px] text-neutral-500">Inflow</span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-neutral-900">
                        ₹{dossier.money.inflow.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-neutral-200/70 px-3.5 py-2.5">
                      <span className="text-[12px] text-neutral-500">Outflow</span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-neutral-900">
                        ₹{dossier.money.outflow.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-neutral-200/70 px-3.5 py-2.5">
                      <span className="text-[12px] text-neutral-500">Transactions</span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-neutral-900">{dossier.money.txns}</span>
                    </div>
                  </div>

                  <p className="mb-2.5 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Accounts</p>
                  <div className="space-y-2">
                    {(dossier.bankAccounts ?? []).map((a, i) => (
                      <div key={i} className="rounded-2xl border border-neutral-200/70 px-3.5 py-2.5">
                        <p className="text-[12px] font-medium text-neutral-800">{a.bank}</p>
                        <p className="font-mono text-[11px] tabular-nums text-neutral-500">{a.acct}</p>
                      </div>
                    ))}
                    {(dossier.verifiedAddress && dossier.verifiedAddress !== "None") && (
                      <div className="rounded-2xl bg-neutral-50 px-3.5 py-2.5 text-[11px] text-neutral-500">
                        {dossier.verifiedAddress}
                      </div>
                    )}
                  </div>

                  {dossier.firs.length > 0 && (
                    <>
                      <p className="mb-2.5 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                        Linked FIRs <span className="normal-case text-neutral-300">· click to reconstruct</span>
                      </p>
                      <div className="space-y-1.5">
                        {dossier.firs.map((f) => (
                          <Link
                            key={f.fir_no}
                            href="/cases"
                            className="flex items-center gap-2 rounded-2xl border border-neutral-200/70 px-3.5 py-2.5 text-[11.5px] transition-colors hover:border-neutral-950"
                          >
                            <FileText className="size-3.5 shrink-0 text-neutral-400" />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-medium text-neutral-800">{f.fir_no}</span>
                              <span className="ml-1.5 text-neutral-400">{f.title}</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    Top contacts <span className="normal-case text-neutral-300">· click to open</span>
                  </p>
                  <div className="space-y-1.5">
                    {dossier.topContacts.slice(0, 6).map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => open(c.key)}
                        className="flex w-full items-center justify-between rounded-2xl px-3.5 py-2 text-[12.5px] transition-colors hover:bg-neutral-50"
                      >
                        <span className="font-medium text-neutral-800">{c.name}</span>
                        <span className="tabular-nums text-neutral-400">{c.calls} calls</span>
                      </button>
                    ))}
                    {dossier.topContacts.length === 0 && (
                      <p className="px-3.5 text-[12px] text-neutral-400">No confirmed contact pairs yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2 pt-4">
                <Link
                  href={`/network?focus=${encodeURIComponent(dossier.key)}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-950 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-neutral-800"
                >
                  Locate in graph
                  <ArrowUpRight className="size-3.5" />
                </Link>
                <Link
                  href={`/ask?q=${encodeURIComponent(`Tell me about ${dossier.name}`)}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 px-4 text-[12.5px] font-semibold text-neutral-800 transition-colors hover:border-neutral-950"
                >
                  Ask about {dossier.name.split(" ")[0]}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <p className="px-8 py-16 text-[13px] text-neutral-400">Dossier not found.</p>
          )}
        </div>
      </div>
    </WsShell>
  );
}