"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReportData } from "@/lib/graph/blockchain";
import { useI18n } from "@/lib/i18n";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

export default function ReportPage() {
  const { t } = useI18n();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      fetch("/api/report")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("report unavailable"))))
        .then((d: ReportData) => setData(d))
        .catch(() => setError("Could not generate the report."));
    }, 0);
    return () => clearTimeout(id);
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-neutral-700">
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-neutral-500">
        {t("report.preparing")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      {/* toolbar — hidden when printing */}
      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between px-4">
        <Link href="/evidence" className="text-sm text-neutral-600 hover:text-neutral-900">
          ← {t("report.backToEvidence")}
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          {t("report.print")}
        </button>
      </div>

      <div className="certificate mx-auto max-w-3xl bg-white p-10 shadow-sm print:max-w-none print:shadow-none">
        {/* header */}
        <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-5">
          <div>
            <p className="text-sm font-bold tracking-[0.25em] text-neutral-900">PREKSHA</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
              {t("report.title")}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              AI-assisted analysis with cryptographic chain of custody
            </p>
          </div>
          <div className="text-right text-xs text-neutral-500">
            <p>{t("report.generated")}: {fmtDate(data.generatedAt)}</p>
            <p>{t("report.status")}: {data.verified ? t("report.verified") : t("report.tamperedStatus")}</p>
          </div>
        </div>

        {/* case */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">{t("report.caseReference")}</h2>
          <p className="mt-2 text-sm font-semibold text-neutral-900">{data.caseTitle}</p>
          <p className="text-sm text-neutral-700">{data.caseFirs.join(", ")}</p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600">{data.summary}</p>
        </section>

        {/* evidence chain */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            {t("report.evidenceChainMerkle")}
          </h2>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="py-1.5 pr-2 font-semibold">{t("report.artifact")}</th>
                <th className="py-1.5 pr-2 font-semibold">{t("report.sha256")}</th>
                <th className="py-1.5 font-semibold">{t("report.statusCol")}</th>
              </tr>
            </thead>
            <tbody>
              {data.chain.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-2 align-top text-neutral-800">{c.label}</td>
                  <td className="break-all py-1.5 pr-2 align-top font-mono text-[10px] text-neutral-600">
                    {c.sha256}
                  </td>
                  <td className="py-1.5 align-top">
                    {c.verified ? (
                      <span className="text-[#2f7c53]">✓</span>
                    ) : (
                      <span className="text-[#c64e27]">✗</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* chain root + anchor */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded border border-neutral-200 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{t("report.chainRoot")}</h3>
            <p className="mt-2 break-all font-mono text-[11px] text-neutral-900">{data.root}</p>
          </div>
          <div className="rounded border border-neutral-200 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              {t("report.blockchainAnchor")}
            </h3>
            <p className="mt-1 text-xs text-neutral-700">{data.anchor.network}</p>
            <p className="mt-1 text-xs text-neutral-600">
              Block #{data.anchor.blockNumber.toLocaleString("en-IN")} · {fmtDate(data.anchor.anchoredAt)}
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-neutral-500">
              tx {data.anchor.txHash}
            </p>
          </div>
        </section>

        {/* reconstruction */}
        {data.reconstruction && data.reconstruction.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              {t("report.reconstructionSummary")}
            </h2>
            <div className="mt-3 space-y-2">
              {data.reconstruction.map((s, i) => (
                <div key={i} className="flex gap-3 border-l-2 border-neutral-300 pl-3 text-xs">
                  <span className="w-24 shrink-0 font-semibold text-neutral-700">{s.phase}</span>
                  <span className="flex-1 text-neutral-800">{s.title}</span>
                  <span className="shrink-0 text-neutral-400">{s.source}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* declaration */}
        <section className="mt-6 rounded border border-neutral-300 bg-neutral-50 p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{t("report.declaration")}</h2>
          <p className="mt-2 text-xs leading-relaxed text-neutral-700">
            {t("report.declarationText")}
          </p>
        </section>

        {/* signature */}
        <section className="mt-10 flex items-end justify-between">
          <div className="text-xs text-neutral-600">
            <p>{t("report.preparedBy")}</p>
            <p className="mt-1 text-neutral-400">{t("report.machineGenerated")}</p>
          </div>
          <div className="text-center text-xs text-neutral-600">
            <div className="h-12 w-40 border-b border-neutral-400" />
            <p className="mt-1">{t("report.signatureSeal")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
