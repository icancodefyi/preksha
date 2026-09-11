"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n, LANGS } from "@/lib/i18n";
import {
  LayoutDashboard,
  MessagesSquare,
  Share2,
  Scale,
  Users,
  ShieldCheck,
  Clapperboard,
  ArrowUpRight,
  Menu,
  X,
  Languages,
  Check,
} from "lucide-react";

export const WS_NAV = [
  { href: "/dashboard", labelKey: "nav.overview", icon: LayoutDashboard, group: "Workspace" },
  { href: "/ask", labelKey: "nav.ask", icon: MessagesSquare, group: "Workspace" },
  { href: "/network", labelKey: "nav.network", icon: Share2, group: "Workspace" },
  { href: "/cases", labelKey: "nav.cases", icon: Scale, group: "Workspace" },
  { href: "/simulate", labelKey: "nav.replay", icon: Clapperboard, group: "Workspace" },
  { href: "/suspects", labelKey: "nav.suspects", icon: Users, group: "Directory" },
  { href: "/evidence", labelKey: "nav.evidence", icon: ShieldCheck, group: "Directory" },
] as const;

const NAV_GROUPS = ["Workspace", "Directory"] as const;

interface OverviewStats {
  firs: number;
  calls: number;
}

export function WsShell({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const { t, lang, setLang } = useI18n();

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.stats && setStats({ firs: d.stats.firs, calls: d.stats.calls }))
      .catch(() => {});
  }, []);

  const nav = (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3">
      {NAV_GROUPS.map((group) => (
        <div key={group} className="space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{group}</p>
          {WS_NAV.filter((item) => item.group === group).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium tracking-[-0.01em] transition-all duration-150",
                  active
                    ? "bg-neutral-950 text-white shadow-[0_1px_2px_rgba(16,15,25,0.08)]"
                    : "text-neutral-500 hover:bg-neutral-100/80 hover:text-neutral-900",
                )}
              >
                {active && (
                  <span className="absolute left-0.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[#c64e27]" />
                )}
                <item.icon
                  className={cn(
                    "size-4 transition-transform duration-150 group-hover:scale-110",
                    active ? "text-white" : "text-neutral-400 group-hover:text-neutral-700",
                  )}
                />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-svh bg-neutral-50 font-sans text-neutral-950 antialiased">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-neutral-950/20 backdrop-blur-[2px] md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[16rem] flex-col border-r border-neutral-200/70 bg-white transition-transform duration-200 ease-out md:relative md:z-0 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-neutral-800 to-neutral-950 text-[11px] font-bold text-white shadow-sm">
              P
            </div>
            <span
              className="text-[15px] font-semibold tracking-[-0.02em] text-neutral-950"
              style={{ fontFamily: '"Alliance No.1", ui-sans-serif, sans-serif' }}
            >
              Preksha
            </span>
            <ArrowUpRight className="size-3.5 text-neutral-300 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-neutral-500" />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        {nav}
        <div className="border-t border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-2 text-[10.5px] leading-[1.5] text-neutral-400">
            <span className={cn("size-1.5 shrink-0 rounded-full", stats ? "bg-[#359462]" : "bg-neutral-300")} />
            {stats ? (
              <span className="tabular-nums">
                {stats.firs} FIRs · {stats.calls.toLocaleString()} calls indexed
              </span>
            ) : (
              "Loading corpus…"
            )}
          </div>
        </div>
      </aside>

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex h-[57px] shrink-0 items-center justify-between border-b border-neutral-200/70 bg-neutral-50/70 px-5 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:hidden"
            >
              <Menu className="size-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-neutral-950">{title}</p>
              {sub && <p className="truncate text-[11px] text-neutral-400">{sub}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {right}
            <div className="relative">
              <button
                onClick={() => setLangOpen((v) => !v)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                title="Language"
              >
                <Languages className="size-3.5" />
                {LANGS.find((l) => l.code === lang)?.label}
              </button>
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
                    {LANGS.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => {
                          setLang(l.code);
                          setLangOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-neutral-50",
                          lang === l.code ? "font-semibold text-neutral-950" : "text-neutral-600",
                        )}
                      >
                        {l.label}
                        {lang === l.code && <Check className="size-3.5" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <ThemeToggle variant="chat" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-5 py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
