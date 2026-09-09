"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
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
} from "lucide-react";

export const WS_NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/ask", label: "Ask Preksha", icon: MessagesSquare },
  { href: "/network", label: "Network", icon: Share2 },
  { href: "/cases", label: "Cases", icon: Scale },
  { href: "/simulate", label: "Replay", icon: Clapperboard },
  { href: "/suspects", label: "Suspects", icon: Users },
  { href: "/evidence", label: "Evidence", icon: ShieldCheck },
];

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

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
      {WS_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors",
              active
                ? "bg-neutral-100 text-neutral-950"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900",
            )}
          >
            <item.icon className={cn("size-4", active ? "text-neutral-950" : "text-neutral-400")} />
            {item.label}
          </Link>
        );
      })}
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
            <div className="flex size-7 items-center justify-center rounded-[9px] bg-neutral-950 text-[11px] font-bold text-white">
              P
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.02em] text-neutral-950">Preksha</span>
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
        <div className="border-t border-neutral-100 px-5 py-4 text-[10.5px] leading-[1.5] text-neutral-400">
          Investigation corpus · 9 FIRs / 10,000 calls indexed
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