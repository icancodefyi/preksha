"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WsShell } from "@/components/ws/ws-shell";
import { Loader2, FileText, Users, ArrowUpRight, Calendar, MessagesSquare } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface CaseSummary {
  id: string;
  title: string;
  categories: string[];
  firCount: number;
  suspectCount: number;
  dateRange: { first: string; last: string };
}

export default function CasesPage() {
  const { t } = useI18n();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/cases").then((r) => r.json()).then(setCases);
  }, []);

  return (
    <WsShell
      title={t("cases.title")}
      sub={t("cases.sub")}
    >
      {!cases ? (
        <p className="flex items-center gap-2 px-1 py-6 text-[12.5px] text-neutral-400">
          <Loader2 className="size-3.5 animate-spin" /> {t("cases.loading")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.id}
              className="group flex flex-col gap-4 rounded-3xl border border-neutral-200/80 bg-white p-5 transition-colors hover:border-neutral-950"
            >
              <Link href={`/cases/${c.id}`} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[16px] font-medium capitalize leading-snug tracking-[-0.01em] text-neutral-950">
                    {c.title}
                  </h2>
                  <ArrowUpRight className="size-4 shrink-0 text-neutral-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-neutral-700" />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {c.categories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500"
                    >
                      {cat.replace(/-/g, " ")}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-[11.5px] text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-3.5 text-neutral-400" />
                    {c.firCount} {t("cases.firs")}{c.firCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5 text-neutral-400" />
                    {c.suspectCount} {t("cases.suspects")}{c.suspectCount === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 tabular-nums">
                    <Calendar className="size-3.5 text-neutral-400" />
                    {c.dateRange.first} → {c.dateRange.last}
                  </span>
                </div>
              </Link>

              <Link
                href={`/ask?case=${c.id}`}
                className="mt-auto flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2 text-[12px] font-semibold text-neutral-700 transition-colors hover:border-neutral-950 hover:bg-neutral-950 hover:text-white"
              >
                <MessagesSquare className="size-3.5" />
                {t("cases.chat")}
              </Link>
            </div>
          ))}
        </div>
      )}
    </WsShell>
  );
}
