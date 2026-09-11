"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WsShell } from "@/components/ws/ws-shell";
import { cn } from "@/lib/utils";
import { Loader2, ShieldCheck, ShieldAlert, FileText, Fingerprint, CheckCircle2, AlertTriangle, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

// Chain item ids are either an FIR number ("0178/2023") or a dataset-category
// rollup ("CDR" | "FIN" | "DUMP") — lib/graph/enrich.ts evidenceChain().
function askQuestionFor(id: string): string {
  if (/^\d{2,4}\/\d{4}$/.test(id)) return `Summarize FIR ${id}`;
  if (id === "CDR") return "Summarize the CDR call analysis";
  if (id === "FIN") return "Summarize the financial records and money flow";
  if (id === "DUMP") return "Summarize the tower dump findings";
  return `Tell me about ${id}`;
}

interface EvidenceItem {
  id: string;
  label: string;
  sha256: string;
  verified: boolean;
}
interface EvidenceChain {
  chain: EvidenceItem[];
  root: string;
  verified: boolean;
  anchor?: { network: string; txHash: string; blockNumber: number; blockHash: string; anchoredAt: string; root: string };
}

export default function EvidencePage() {
  const { t } = useI18n();
  const [chain, setChain] = useState<EvidenceChain | null>(null);
  const [tampered, setTampered] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (tamper: boolean) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/evidence${tamper ? "?tamper=1" : ""}`);
      if (r.ok) setChain(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Deferred so the setState doesn't run synchronously in the effect body.
    const id = setTimeout(() => {
      load(false);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const runTamperDemo = () => {
    const next = !tampered;
    setTampered(next);
    load(next);
  };

  return (
    <WsShell
      title={t("evidence.title")}
      sub={t("evidence.sub")}
      right={
        <div className="flex items-center gap-2">
          <button
            onClick={runTamperDemo}
            disabled={loading}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-colors",
              tampered
                ? "bg-[#2f7c53] text-white hover:bg-[#276a47]"
                : "border border-[#c64e27]/40 bg-[#fff7f3] text-[#a8401f] hover:border-[#c64e27]/70",
            )}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : tampered ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <AlertTriangle className="size-3.5" />
            )}
            {tampered ? t("evidence.restoreChain") : t("evidence.tamperDemo")}
          </button>
          <Link
            href="/report"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            <FileText className="size-3.5" /> {t("common.courtReport")}
          </Link>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Status hero */}
        <div
          className={cn(
            "flex items-center gap-4 rounded-3xl border px-6 py-5",
            chain?.verified
              ? "border-[#359462]/30 bg-[#f3faf6]"
              : "border-[#c64e27]/40 bg-[#fff2ee]",
          )}
        >
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl",
              chain?.verified ? "bg-[#359462] text-white" : "bg-[#c64e27] text-white",
            )}
          >
            {chain?.verified ? <ShieldCheck className="size-6" /> : <ShieldAlert className="size-6" />}
          </div>
          <div>
            <p
              className={cn(
                "text-[15px] font-semibold tracking-[-0.01em]",
                chain?.verified ? "text-[#1c5c3d]" : "text-[#8f3a1f]",
              )}
            >
              {chain?.verified
                ? tampered
                  ? t("evidence.chainRestored")
                  : t("evidence.chainVerified")
                : t("evidence.tamperDetected")}
            </p>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-neutral-500">
              {t("evidence.eachArtifact")}
            </p>
          </div>
          {chain && (
            <span
              className={cn(
                "ml-auto hidden rounded-full px-3 py-1.5 text-[11px] font-semibold tabular-nums sm:block",
                chain.verified ? "bg-[#359462]/10 text-[#2f7c53]" : "bg-[#c64e27]/10 text-[#a8401f]",
              )}
            >
              {chain.chain.length} {t("evidence.artifacts")}
            </span>
          )}
        </div>

        {/* Chain */}
        {chain ? (
          <div className="rounded-3xl border border-neutral-200/80 bg-white px-6 py-6">
            <div className="space-y-0">
              {chain.chain.map((item, i) => (
                <div key={item.id}>
                  <Link
                    href={`/ask?q=${encodeURIComponent(askQuestionFor(item.id))}`}
                    title="Ask about this artifact"
                    className="group flex items-center gap-4 rounded-2xl py-3 pr-2 transition-colors hover:bg-neutral-50"
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
                        item.verified ? "bg-neutral-100 text-neutral-600" : "bg-[#c64e27]/10 text-[#c64e27]",
                      )}
                    >
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.01em] text-neutral-900">
                        {item.label}
                        {item.verified ? (
                          <CheckCircle2 className="size-3.5 text-[#359462]" />
                        ) : (
                          <AlertTriangle className="size-3.5 text-[#c64e27]" />
                        )}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10.5px] tabular-nums text-neutral-400">
                        {item.sha256}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]",
                        item.verified ? "bg-[#359462]/10 text-[#2f7c53]" : "bg-[#c64e27]/10 text-[#a8401f]",
                      )}
                    >
                      {item.verified ? t("evidence.valid") : t("evidence.tampered")}
                    </span>
                    <ArrowUpRight className="size-3.5 shrink-0 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                  {i < chain.chain.length - 1 && (
                    <div className="ml-[17px] h-px w-px border-l border-dashed border-neutral-200" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl bg-neutral-950 px-4 py-3.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                <Fingerprint className="size-3" /> {t("evidence.chainRoot")}
              </p>
              <p className="mt-1.5 break-all font-mono text-[11.5px] tabular-nums text-neutral-300">{chain.root}</p>
            </div>

            {chain.anchor && (
              <div className="mt-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  <ShieldCheck className="size-3" /> {t("evidence.blockchainAnchor")}
                </p>
                <p className="mt-1.5 text-[12.5px] font-medium text-neutral-800">{chain.anchor.network}</p>
                <p className="mt-1 text-[11.5px] text-neutral-500">
                  Block #{chain.anchor.blockNumber.toLocaleString("en-IN")} · {new Date(chain.anchor.anchoredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
                <p className="mt-1.5 break-all font-mono text-[10.5px] text-neutral-400">tx {chain.anchor.txHash}</p>
              </div>
            )}

            <p className="mt-4 text-[11px] leading-[1.6] text-neutral-400">
              {tampered ? t("evidence.tamperWarning") : t("evidence.liveDemo")}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-3xl border border-neutral-200 bg-white px-6 py-16 text-[13px] text-neutral-400">
            <Loader2 className="size-4 animate-spin" /> {t("evidence.hashing")}
          </div>
        )}
      </div>
    </WsShell>
  );
}