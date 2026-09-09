"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import { Loader2, Scale, AlertCircle, Play } from "lucide-react";

interface Accused {
  name: string | null;
  alias: string;
  description: string;
  status: string;
}
interface FirLite {
  idx: number;
  fir_no: string;
  year: string;
  police_station: string;
  incident_date: string;
  title: string;
  category: string;
  sections: string[];
  related_firs: number[];
  // API (app/api/firs/route.ts) returns the full accused object array, not
  // strings — rendering it directly as {a} previously crashed the page
  // ("Objects are not valid as a React child") for every FIR with an
  // accused entry.
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

const PHASE_COLOR: Record<string, string> = {
  Premeditation: "#8b5cf6",
  "Money movement": "#0d7abf",
  Offense: "#d9562b",
  "Presence evidence": "#0d7abf",
  "Escape / coordination": "#c98a2b",
  Settlement: "#2f7c53",
};

export default function CasesPage() {
  const [firs, setFirs] = useState<FirLite[]>([]);
  const [selected, setSelected] = useState<FirLite | null>(null);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/firs").then((r) => r.json()).then(setFirs);
  }, []);

  const openCase = async (f: FirLite) => {
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
    <WsShell
      title="Cases & reconstruction"
      sub="Every offence rebuilt as a verified timeline across CDR, tower dump and financials"
    >
      <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        {/* FIR list */}
        <div className="rounded-3xl border border-neutral-200/80 bg-white lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
          <div className="border-b border-neutral-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              Loaded FIRs
            </p>
            <p className="mt-1 text-[11px] text-neutral-400">Click a case to reconstruct its timeline.</p>
          </div>
          <div className="space-y-1 p-2.5">
            {firs.length === 0 && (
              <p className="flex items-center gap-2 px-3 py-6 text-[12.5px] text-neutral-400">
                <Loader2 className="size-3.5 animate-spin" /> Loading cases…
              </p>
            )}
            {firs.map((f) => (
              <button
                key={f.idx}
                onClick={() => openCase(f)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-2xl px-3.5 py-3 text-left transition-colors",
                  selected?.idx === f.idx ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-semibold tracking-[-0.01em] text-neutral-900">
                    FIR {f.fir_no}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-400">
                    {f.category}
                  </span>
                </div>
                <p className="truncate text-[13px] text-neutral-600">{f.title}</p>
                <p className="text-[11px] tabular-nums text-neutral-400">
                  {f.incident_date} · {f.police_station}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Reconstruction */}
        <div className="rounded-3xl border border-neutral-200/80 bg-white">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center px-8 py-24 text-center">
              <Scale className="size-8 text-neutral-200" />
              <p className="mt-4 max-w-xs text-[13.5px] leading-[1.6] text-neutral-500">
                Select an FIR to rebuild what happened around it — the calls, the cash and the devices that
                were already there before the offence.
              </p>
            </div>
          ) : (
            <div className="px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-white">
                      FIR {selected.fir_no}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-400">
                      {selected.category}
                    </span>
                    {selected.idx === 4 && (
                      <Link
                        href="/simulate?fir=4"
                        className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-neutral-800"
                      >
                        <Play className="size-3" /> Replay in 3D
                      </Link>
                    )}
                  </div>
                  <h2 className="mt-3 text-[22px] font-medium leading-tight tracking-[-0.02em] text-neutral-950">
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-[12px] tabular-nums text-neutral-400">
                    {selected.incident_date} · {selected.police_station} · {selected.sections.join(", ")}
                  </p>
                </div>
              </div>

              {selected.related_firs.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    Linked cases <span className="normal-case text-neutral-300">· click to open</span>
                  </span>
                  {selected.related_firs.map((r) => {
                    const target = firs.find((f) => f.idx === r);
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={!target}
                        onClick={() => target && openCase(target)}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors enabled:hover:border-neutral-950 enabled:hover:text-neutral-950 disabled:opacity-50"
                        title={target ? `FIR ${target.fir_no} — ${target.title}` : "Not loaded"}
                      >
                        {target ? `FIR ${target.fir_no}` : `#${r}`}
                      </button>
                    );
                  })}
                </div>
              )}

              {selected.accused.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    Accused <span className="normal-case text-neutral-300">· click to search suspects</span>
                  </span>
                  {selected.accused.map((a, i) => {
                    const label = a.name ?? a.alias;
                    return (
                      <Link
                        key={i}
                        href={`/suspects?focus=${encodeURIComponent(a.name ?? a.alias)}`}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-neutral-950 hover:text-neutral-950"
                        title={a.description}
                      >
                        {label}
                      </Link>
                    );
                  })}
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
                        <span
                          className="absolute -left-[31px] top-1 size-3 rounded-full ring-4 ring-white"
                          style={{ backgroundColor: PHASE_COLOR[s.phase] ?? "#9ca3af" }}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-600">
                            {s.phase}
                          </span>
                          <span className="text-[10.5px] tabular-nums text-neutral-400">{s.time}</span>
                        </div>
                        <p className="mt-1.5 text-[13.5px] font-medium leading-[1.5] text-neutral-900">{s.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-400">
                          <AlertCircle className="size-3" /> source: {s.source}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-10 text-[13px] text-neutral-400">No reconstruction available for this case.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </WsShell>
  );
}