"use client";

import React, { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WS_NAV } from "@/components/ws/ws-shell";
import { MarkdownAnswer } from "@/components/MarkdownAnswer";
import { useI18n } from "@/lib/i18n";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  ArrowUpRight,
  Loader2,
  Menu,
  X,
  FileText,
  Phone,
  Landmark,
  RadioTower,
  Users,
  Network,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  Mic,
  Activity,
  Fingerprint,
  SquarePen,
  Volume2,
  Square,
} from "lucide-react";

interface AskSource {
  label: string;
  ref: string;
}
interface AskStep {
  label: string;
  detail?: string;
  ms: number;
}
interface AskAnswer {
  answer: string;
  sources: AskSource[];
  suggested: string[];
  confidence: "high" | "medium" | "low";
  trace: AskStep[];
}
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  structured?: AskAnswer;
}

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
}

const SUGGESTED = [
  "Who appears in more than one FIR?",
  "How is the money moving?",
  "What is the kingpin score?",
  "What happened before the Dadar robbery?",
  "Why is the burner number a lead?",
  "Who should we arrest first?",
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
      {children}
    </p>
  );
}

const CONFIDENCE_STYLE: Record<AskAnswer["confidence"], { dot: string; text: string }> = {
  high: { dot: "bg-[#359462]", text: "text-[#2f7c53]" },
  medium: { dot: "bg-[#c98a2b]", text: "text-[#96681c]" },
  low: { dot: "bg-[#c64e27]", text: "text-[#a8401f]" },
};
const CONFIDENCE_LABEL: Record<AskAnswer["confidence"], string> = {
  high: "high confidence",
  medium: "medium confidence",
  low: "low confidence",
};

function QueryTrace({
  steps,
  live,
  open,
  onToggle,
}: {
  steps: AskStep[];
  live: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const latest = steps[steps.length - 1];
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-neutral-50"
      >
        {live ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-400" />
        ) : (
          <CheckCircle2 className="size-3.5 shrink-0 text-[#359462]" />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-600",
            live && "shimmer",
          )}
        >
          {live ? (latest?.label ?? "Analysing the question…") : t("ask.howAnswered")}
        </span>
        {!live && steps.length > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
            {(steps[steps.length - 1].ms / 1000).toFixed(1)}s
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-neutral-400 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && steps.length > 0 && (
        <ol className="space-y-2.5 border-t border-neutral-100 px-4 py-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-neutral-300" />
              <span className="min-w-0 flex-1">
                <span className="text-[12.5px] font-medium text-neutral-700">{s.label}</span>
                {s.detail && (
                  <span className="block text-[11.5px] leading-[1.5] text-neutral-400">{s.detail}</span>
                )}
              </span>
              <span className="shrink-0 pt-px text-[11px] tabular-nums text-neutral-300">
                {s.ms < 1000 ? `${s.ms}ms` : `${(s.ms / 1000).toFixed(1)}s`}
              </span>
            </li>
          ))}
          {live && (
            <li className="flex gap-2.5">
              <span className="mt-[6px] size-1.5 shrink-0 animate-pulse rounded-full bg-neutral-400" />
              <span className="shimmer text-[12.5px] font-medium text-neutral-500">Working…</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function MessageBubble({ message, onFollowUp }: { message: ChatMessage; onFollowUp: (q: string) => void }) {
  const isUser = message.role === "user";
  const a = message.structured;
  const [openTrace, setOpenTrace] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const { t, speechLang } = useI18n();

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const plain = text.replace(/[#*_`\[\]()]/g, " ");
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = speechLang;
    const voices = window.speechSynthesis.getVoices();
    const best =
      voices.find((v) => v.lang === speechLang) ??
      voices.find((v) => v.lang.startsWith(speechLang.slice(0, 2)));
    if (best) u.voice = best;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-neutral-950 px-4 py-2.5 text-[14px] leading-[1.55] tracking-[-0.01em] text-white sm:max-w-[75%]">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  if (!a) {
    return (
      <div className="max-w-[85%] rounded-[20px] rounded-bl-[6px] border border-neutral-200/80 bg-white px-4 py-3 text-[14px] leading-[1.6] text-neutral-700 sm:max-w-[75%]">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    );
  }

  const confidence = CONFIDENCE_STYLE[a.confidence];

  return (
    <div className="w-full space-y-2">
      <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(16,15,25,0.04),0_12px_32px_-12px_rgba(16,15,25,0.10)]">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 sm:px-7">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-2 py-1 text-[11px] font-semibold tracking-[0.02em] text-white">
            <Fingerprint className="size-3" />
            Analysis
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", confidence.dot)} />
            <span className={cn("text-[11px] font-medium", confidence.text)}>
              {CONFIDENCE_LABEL[a.confidence]}
            </span>
          </span>
          <button
            type="button"
            onClick={() => speak(a.answer)}
            title={speaking ? t("ask.stopSpeaking") : t("ask.speak")}
            className="ml-auto inline-flex h-6 items-center gap-1 rounded-full border border-neutral-200 px-2.5 text-[10px] font-medium text-neutral-500 transition-colors hover:border-neutral-950 hover:text-neutral-950"
          >
            {speaking ? <Square className="size-3" /> : <Volume2 className="size-3" />}
            {speaking ? t("ask.stopSpeaking") : t("ask.speak")}
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          <MarkdownAnswer text={a.answer} />

          {a.suggested.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>{t("ask.followUp")}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {a.suggested.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onFollowUp(q)}
                    className="rounded-full border border-neutral-200/80 bg-white px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-neutral-600 transition-colors hover:border-neutral-950 hover:text-neutral-950"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {a.sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-neutral-100 bg-neutral-50/70 px-5 py-3 sm:px-7">
            <SectionLabel>{t("ask.sources")}</SectionLabel>
            {a.sources.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                title={c.ref}
              >
                <FileText className="size-3 text-neutral-400" />
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {a.trace.length > 0 && (
        <QueryTrace steps={a.trace} live={false} open={openTrace} onToggle={() => setOpenTrace((v) => !v)} />
      )}
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskPageInner />
    </Suspense>
  );
}

function AskPageInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, speechLang } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [evidenceVerified, setEvidenceVerified] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [liveTrace, setLiveTrace] = useState<AskStep[]>([]);
  const [liveTraceOpen, setLiveTraceOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // "Chat with case" (from /cases and /cases/[caseId]) lands here as
  // /ask?case=<id> — every question then goes through /api/ask?case=<id>,
  // which the rag_service restricts to that case's tagged documents only
  // (see rag_service/corpus.py). This never silently widens to global data.
  const caseId = searchParams.get("case");
  const [caseContext, setCaseContext] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!caseId) {
      setCaseContext(null);
      return;
    }
    fetch(`/api/cases/${caseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCaseContext(d ? { id: d.id, title: d.title } : null));
  }, [caseId]);

  // Chat history was purely in-memory (useState), so it vanished on every
  // navigation away from /ask — App Router unmounts the page. Persist it to
  // localStorage per scope (global vs. a specific case, so switching cases
  // never shows another case's conversation) and restore on mount/scope
  // change.
  const storageKey = caseId ? `preksha:chat:case:${caseId}` : "preksha:chat:global";
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = storageKey;
    hydratedKeyRef.current = null;
    // Deferred a tick (async boundary) so this setState doesn't run
    // synchronously inside the effect body — same pattern used for the
    // focus-from-URL effect above.
    queueMicrotask(() => {
      let restored: ChatMessage[] = [];
      try {
        const raw = localStorage.getItem(key);
        restored = raw ? JSON.parse(raw) : [];
      } catch {
        restored = [];
      }
      setMessages(restored);
      hydratedKeyRef.current = key;
    });
  }, [storageKey]);

  useEffect(() => {
    if (hydratedKeyRef.current !== storageKey) return; // restore hasn't landed yet — don't clobber storage
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* storage full/unavailable — chat still works in-memory for this session */
    }
  }, [messages, storageKey]);

  const newChat = () => setMessages([]);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/overview");
      if (res.ok) setOverview(await res.json());
    } catch {
      /* cosmetics never break the page */
    }
    try {
      const res = await fetch("/api/evidence");
      if (res.ok) setEvidenceVerified((await res.json()).verified);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Cross-page navigation target: /ask?q=<question> (from Suspects' "Ask
  // about X" button, Evidence chain items, etc.) — submit it once on load.
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    const q = searchParams.get("q");
    if (!q || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    handleSubmit(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const startListening = () => {
    interface SRResultEvent {
      results: { 0: { 0: { transcript: string } } };
    }
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
      ?? null;
    type SpeechRecognitionLike = {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: ((e: SRResultEvent) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
    };
    if (!Ctor) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = speechLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      setInput(event.results[0][0].transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const handleSubmit = async (text: string) => {
    if (!text.trim() || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);
    setLiveTrace([]);
    setLiveTraceOpen(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, case: caseId ?? undefined }),
      });
      if (!res.ok) {
        const err = await res.text();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Request failed (${res.status}): ${err.slice(0, 200)}` },
        ]);
        return;
      }
      const data: AskAnswer = await res.json();
      setLiveTrace(data.trace);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, structured: data },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Network error: ${err instanceof Error ? err.message : "unknown"}` },
      ]);
    } finally {
      setLoading(false);
      setLiveTrace([]);
    }
  };

  const stats = overview?.stats;
  const hasCorpus = (stats?.firs ?? 0) > 0;

  const sources = stats
    ? [
        { label: "FIRs", value: stats.firs.toLocaleString(), icon: FileText, accent: "text-[#0570b0]" },
        { label: "CDR calls", value: stats.calls.toLocaleString(), icon: Phone, accent: "text-[#0570b0]" },
        { label: "Financial records", value: stats.financial.toLocaleString(), icon: Landmark, accent: "text-[#0570b0]" },
        { label: "Tower dumps", value: stats.towerDumps.toLocaleString(), icon: RadioTower, accent: "text-[#0570b0]" },
        { label: "Subscribers", value: stats.subscribers.toLocaleString(), icon: Users, accent: "text-[#0570b0]" },
        { label: "Network members", value: stats.members.toLocaleString(), icon: Network, accent: "text-[#0570b0]" },
      ]
    : [];

  const pipeline = [
    { label: "Connected calls", value: stats ? stats.calls.toLocaleString() : "—" },
    { label: "Money moved (₹)", value: stats ? stats.moneyMoved.toLocaleString("en-IN") : "—" },
    { label: "Communities found", value: stats ? String(stats.clusters) : "—" },
    { label: "Burner devices", value: stats ? String(stats.burners) : "—" },
    { label: "Evidence chain", value: evidenceVerified === null ? "—" : evidenceVerified ? "verified" : "tampered" },
  ];

  return (
    <div className="flex h-svh bg-neutral-50 font-sans text-neutral-950 antialiased">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-neutral-950/20 backdrop-blur-[2px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ───────────────────────── Sidebar ───────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[19rem] flex-col border-r border-neutral-200/70 bg-white transition-transform duration-200 ease-out md:relative md:z-0 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
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
            onClick={() => setSidebarOpen(false)}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="space-y-0.5 px-4 pb-4">
          {WS_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-neutral-100 text-neutral-950"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900",
                )}
              >
                <item.icon className={cn("size-4", active ? "text-neutral-950" : "text-neutral-400")} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 space-y-7 overflow-y-auto px-4 pb-6">
          <section>
            <div className="mb-2.5 flex items-baseline gap-2 px-1">
              <SectionLabel>Investigation corpus</SectionLabel>
            </div>
            <div className="space-y-1">
              {sources.length === 0 && (
                <p className="rounded-2xl border border-dashed border-neutral-200 px-3.5 py-3 text-[12px] leading-[1.5] text-neutral-400">
                  Loading corpus…
                </p>
              )}
              {sources.map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-neutral-100 text-neutral-500">
                    <s.icon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-neutral-900">{s.label}</p>
                    <p className="text-[11px] tabular-nums text-neutral-400">{s.value} loaded</p>
                  </div>
                  <ShieldCheck className="size-3.5 shrink-0 text-[#359462]" />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2.5 px-1">
              <SectionLabel>Corpus stats</SectionLabel>
            </div>
            <dl className="overflow-hidden rounded-2xl border border-neutral-200/70">
              {pipeline.map((s, i) => (
                <div
                  key={s.label}
                  className={cn(
                    "flex items-center justify-between px-3.5 py-2.5",
                    i > 0 && "border-t border-neutral-100",
                  )}
                >
                  <dt className="text-[12px] text-neutral-500">{s.label}</dt>
                  <dd
                    className={cn(
                      "text-[12px] font-semibold tabular-nums tracking-[-0.01em]",
                      s.label === "Evidence chain" && s.value === "tampered"
                        ? "text-[#a8401f]"
                        : s.label === "Evidence chain"
                          ? "text-[#2f7c53]"
                          : "text-neutral-900",
                    )}
                  >
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <details className="group rounded-2xl border border-neutral-200/70 px-3.5 py-2.5">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-neutral-500 transition-colors hover:text-neutral-900">
                What is this?
                <span className="float-right text-neutral-300 transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="mt-3 space-y-2 text-[11px] leading-[1.6] text-neutral-500">
                <p>Preksha fuses FIR narratives, CDR, financial records, tower dumps and the subscriber master into a single evidence-grounded investigation graph.</p>
                <p>Every answer cites the records it was derived from, and the evidence chain is SHA-256 hashed for Section 65B / BSA-2023 admissibility.</p>
              </div>
            </details>
          </section>
        </div>
      </aside>

      {/* ───────────────────────── Main ───────────────────────── */}
      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex h-[57px] shrink-0 items-center justify-between border-b border-neutral-200/70 bg-neutral-50/70 px-5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:hidden"
            >
              <Menu className="size-4" />
            </button>
            <p className="text-[13px] font-medium tracking-[-0.01em] text-neutral-950">Ask Preksha</p>
            {caseId && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-950 py-1 pl-2.5 pr-1 text-[11px] font-medium capitalize text-white">
                {caseContext ? `Case: ${caseContext.title}` : "Loading case…"}
                <Link
                  href="/ask"
                  title="Exit case scope — chat globally"
                  className="flex size-4 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10 hover:text-white"
                >
                  <X className="size-3" />
                </Link>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-[11px] font-medium text-neutral-400 sm:flex">
              <span className={cn("size-1.5 rounded-full", hasCorpus ? "bg-[#359462]" : "bg-neutral-300")} />
              <span className="tabular-nums">
                {hasCorpus ? `${stats?.firs ?? 0} FIRs · ${(stats?.calls ?? 0).toLocaleString()} calls indexed` : "corpus offline"}
              </span>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={newChat}
                title="Clear this conversation and start over"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-[12px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
              >
                <SquarePen className="size-3.5" />
                New chat
              </button>
            )}
            <ThemeToggle variant="chat" />
            <Link
              href="/dashboard"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-950 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              <Activity className="size-3.5" />
              Workspace
            </Link>
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto px-5">
          <div className="mx-auto max-w-[46rem] space-y-6 py-8">
            {messages.length === 0 && (
              <div className="flex flex-col items-center px-2 pt-[10vh] text-center">
                <h1 className="max-w-[22rem] text-[2rem] font-medium leading-[1.05] tracking-[-0.04em] sm:max-w-lg sm:text-[2.75rem] sm:tracking-[-0.045em]">
                  <span className="block text-neutral-950">Ask the case.</span>
                  <span className="block text-[#359462]">Preksha already read the files.</span>
                </h1>
                <p className="mt-4 max-w-[26rem] text-[14px] font-medium leading-[1.55] tracking-[-0.02em] text-neutral-600 sm:text-[15px]">
                  Trace a burner phone, follow the money, or ask who runs the network — every answer is cited
                  back to the FIRs, CDR and ledgers it came from.
                </p>

                {hasCorpus && (
                  <>
                    <div className="mt-10 grid w-full max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {[
                        { label: "FIRs", value: (stats?.firs ?? 0).toLocaleString() },
                        { label: "CDR calls", value: (stats?.calls ?? 0).toLocaleString() },
                        { label: "Txns", value: (stats?.financial ?? 0).toLocaleString() },
                        { label: "Network links", value: String(44) },
                      ].map((s) => (
                        <div key={s.label} className="rounded-2xl border border-neutral-200/70 bg-white px-3.5 py-3 text-left">
                          <p className="text-[20px] font-medium tabular-nums leading-none tracking-[-0.03em] text-neutral-950">
                            {s.value}
                          </p>
                          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-400">
                            {s.label}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 flex w-full max-w-lg flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                      {SUGGESTED.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSubmit(q)}
                          className="rounded-full border border-neutral-200/80 bg-white px-3.5 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-neutral-600 transition-colors hover:border-neutral-950 hover:text-neutral-950"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i}>
                <MessageBubble message={msg} onFollowUp={(q) => handleSubmit(q)} />
              </div>
            ))}

            {loading && (
              <QueryTrace steps={liveTrace} live open={liveTraceOpen} onToggle={() => setLiveTraceOpen((v) => !v)} />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Composer ── */}
        <div className="shrink-0 px-5 pb-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
            className="mx-auto max-w-[46rem]"
          >
            <div className="rounded-[26px] border border-neutral-200/80 bg-white p-2 shadow-[0_1px_2px_rgba(16,15,25,0.04),0_16px_40px_-16px_rgba(16,15,25,0.14)] transition-colors focus-within:border-neutral-400">
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 168)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSubmit(input);
                  }
                }}
                placeholder={t("ask.placeholder")}
                disabled={loading}
                className="max-h-[168px] w-full resize-none bg-transparent px-3 pb-1 pt-2 text-[14.5px] leading-[1.55] tracking-[-0.01em] text-neutral-950 placeholder:text-neutral-400 focus:outline-none disabled:opacity-50"
              />
              <div className="flex items-center gap-1.5 px-1 pt-1">
                <button
                  type="button"
                  onClick={startListening}
                  disabled={loading || listening}
                  title={listening ? t("ask.listening") : t("ask.voice")}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-colors",
                    listening
                      ? "bg-[#c64e27] text-white"
                      : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700",
                  )}
                >
                  <Mic className={cn("size-4", listening && "animate-pulse")} />
                </button>
                <span className="ml-auto hidden pr-1 text-[10.5px] text-neutral-300 lg:block">{t("ask.send")}</span>
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white transition-all hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </button>
              </div>
            </div>
          </form>
          <p className="mt-2.5 text-center text-[10.5px] text-neutral-400">
            Analysis is derived from records already loaded. Findings are hypotheses to verify — the evidence
            chain keeps the original artifacts intact.
          </p>
        </div>
      </div>
    </div>
  );
}