"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import {
  FileText,
  Phone,
  Landmark,
  RadioTower,
  Users,
  IndianRupee,
  ShieldAlert,
  Activity,
  ArrowUpRight,
  Flame,
  Wallet,
} from "lucide-react";

interface Overview {
  stats: {
    firs: number;
    calls: number;
    financial: number;
    towerDumps: number;
    subscribers: number;
    members: number;
    clusters: number;
    burners: number;
    moneyMoved: number;
    activeAlerts: number;
  };
  kingpin: { name: string; risk: number } | null;
  topAlerts: { type: string; severity: string; title: string; detail: string; evidence: string[] }[];
  money: { nodes: number; edges: number };
  activeCase: string | null;
}

interface DossierLite {
  key: string;
  name: string;
  alias: string | null;
  role: string;
  cluster: string;
  city: string;
  risk: number;
  firCount: number;
  firs: { fir_no: string; title: string }[];
  metrics: { betweenness: number; pagerank: number; degree: number } | null;
  topContacts: { key: string; name: string; calls: number }[];
  money: { inflow: number; outflow: number; txns: number };
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [kingpin, setKingpin] = useState<DossierLite | null>(null);
  const [disruptionPct, setDisruptionPct] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/overview").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/suspects/rajesh").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/network").then((r) => (r.ok ? r.json() : null)),
    ]).then(([ov, kp, net]) => {
      setOverview(ov);
      setKingpin(kp);
      const rank = net?.disruptionRanking?.[0];
      if (rank && typeof rank.fragmentationPct === "number") setDisruptionPct(rank.fragmentationPct);
    });
  }, []);

  const stats = overview?.stats;

  const cards = stats
    ? [
        { label: "FIRs linked", value: stats.firs.toLocaleString(), icon: FileText },
        { label: "CDR calls", value: stats.calls.toLocaleString(), icon: Phone },
        { label: "Financial records", value: stats.financial.toLocaleString(), icon: Landmark },
        { label: "Tower dumps", value: stats.towerDumps.toLocaleString(), icon: RadioTower },
        { label: "Subscribers", value: stats.subscribers.toLocaleString(), icon: Users },
        { label: "Money moved", value: `₹${stats.moneyMoved.toLocaleString("en-IN")}`, icon: IndianRupee },
      ]
    : [];

  const severityStyle: Record<string, string> = {
    high: "bg-[#c64e27]/10 text-[#a8401f]",
    medium: "bg-[#c98a2b]/10 text-[#96681c]",
    low: "bg-neutral-100 text-neutral-500",
  };

  return (
    <WsShell title="Investigation overview" sub={stats ? `${stats.firs} FIRs · ${stats.calls.toLocaleString()} calls cross-referenced` : undefined}>
      <div className="space-y-8">
        {!overview && (
          <p className="text-[13px] text-neutral-400">Loading evidence graph…</p>
        )}

        {stats && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cards.map((c) => (
                <div key={c.label} className="rounded-2xl border border-neutral-200/70 bg-white px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[20px] font-medium tabular-nums leading-none tracking-[-0.03em] text-neutral-950">
                      {c.value}
                    </p>
                    <c.icon className="size-4 text-neutral-300" />
                  </div>
                  <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">
                    {c.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Kingpin spotlight + alerts */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(16,15,25,0.04),0_12px_32px_-12px_rgba(16,15,25,0.10)] lg:col-span-2">
                <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    Network principal
                  </p>
                  <Link
                    href={`/suspects?focus=${encodeURIComponent(kingpin?.name ?? "")}`}
                    className="group inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900"
                  >
                    Open dossier
                    <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </div>

                {kingpin ? (
                  <div className="space-y-5 px-6 py-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-[26px] font-medium tracking-[-0.03em] text-neutral-950">
                          {kingpin.name}
                          {kingpin.alias ? <span className="text-neutral-400"> · “{kingpin.alias}”</span> : null}
                        </h2>
                        <p className="mt-1 text-[13px] text-neutral-500">
                          {kingpin.role} · {kingpin.city} · bridges {kingpin.cluster}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">Risk score</p>
                        <p className="mt-1 text-[32px] font-medium tabular-nums leading-none tracking-[-0.03em] text-neutral-950">
                          {kingpin.risk}
                        </p>
                        <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-neutral-100">
                          <div className="h-full rounded-full bg-[#c64e27]" style={{ width: `${kingpin.risk}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                        <p className="text-[18px] font-medium tabular-nums tracking-[-0.02em] text-neutral-950">
                          {kingpin.firCount}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">FIRs linked</p>
                      </div>
                      <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                        <p className="text-[18px] font-medium tabular-nums tracking-[-0.02em] text-neutral-950">
                          {disruptionPct ?? "—"}
                          {disruptionPct !== null ? "%" : ""}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Network fragmentation</p>
                      </div>
                      <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                        <p className="text-[18px] font-medium tabular-nums tracking-[-0.02em] text-neutral-950">
                          {kingpin.metrics ? Math.round(kingpin.metrics.betweenness * 100) / 100 : "—"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Betweenness</p>
                      </div>
                      <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                        <p className="text-[18px] font-medium tabular-nums tracking-[-0.02em] text-neutral-950">
                          {kingpin.money.inflow.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">Inflow (₹)</p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                        Warm contacts
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {kingpin.topContacts.slice(0, 5).map((c, i) => (
                          <Link
                            key={i}
                            href={`/suspects?focus=${encodeURIComponent(c.name)}`}
                            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-950 hover:text-neutral-950"
                          >
                            {c.name}
                            <span className="ml-1.5 tabular-nums text-neutral-400">{c.calls} calls</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-10 text-[13px] text-neutral-400">Loading principal dossier…</div>
                )}
              </div>

              {/* Alerts */}
              <div className="rounded-3xl border border-neutral-200/80 bg-white">
                <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    Pattern alerts
                  </p>
                  <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-neutral-400">
                    <Activity className="size-3.5" />
                    {stats.activeAlerts} high
                  </span>
                </div>
                <div className="space-y-1 px-3 py-3">
                  {(overview.topAlerts ?? []).map((a, i) => (
                    <Link
                      key={i}
                      href={`/ask?q=${encodeURIComponent(a.title)}`}
                      title="Ask about this alert"
                      className="flex gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-neutral-50"
                    >
                      <div className="mt-px flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-neutral-100 text-neutral-500">
                        {a.type === "false_subscriber" ? (
                          <Flame className="size-3.5" />
                        ) : a.type === "comms_burst" ? (
                          <Activity className="size-3.5" />
                        ) : (
                          <Wallet className="size-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                              severityStyle[a.severity] ?? "bg-neutral-100 text-neutral-500",
                            )}
                          >
                            {a.severity}
                          </span>
                          {a.evidence.length > 0 && (
                            <span className="text-[10px] text-neutral-300">{a.evidence.length} evidence item{a.evidence.length === 1 ? "" : "s"}</span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium tracking-[-0.01em] text-neutral-900">
                          {a.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.5] text-neutral-500">{a.detail}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Active case strip */}
            {overview.activeCase && (
              <Link
                href="/cases"
                className="group flex items-center justify-between gap-4 rounded-3xl border border-[#c64e27]/20 bg-[#fff7f3] px-6 py-5 transition-colors hover:border-[#c64e27]/40"
              >
                <div className="flex items-center gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#c64e27]/10 text-[#c64e27]">
                    <ShieldAlert className="size-5" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#a8401f]">
                      Active case · FIR 0666/2025 — kidnapping
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#b2670b]">
                      Burner phone 9890919293 co-located with two known network lines this month.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#a8401f]">
                  Reconstruct
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </Link>
            )}
          </>
        )}
      </div>
    </WsShell>
  );
}