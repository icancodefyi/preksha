"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SimScene, { type SimController } from "@/components/sim/SimScene";
import type { SimData } from "@/lib/graph/simulation";

interface FirSummary {
  idx: number;
  fir_no: string;
  title: string;
  incident_date: string;
}

const SPEEDS = [0.5, 1, 2];

// continuous narration timeline — each segment plays as the replay reaches its start time
const NARRATION_SEGMENTS: { t: number; key: string }[] = [
  { t: 1, key: "n01" },
  { t: 10, key: "n02" },
  { t: 19, key: "n03" },
  { t: 30, key: "n04" },
  { t: 40, key: "n05" },
  { t: 50, key: "n06" },
  { t: 56, key: "n07" },
  { t: 64, key: "n08" },
  { t: 73, key: "n09" },
  { t: 83, key: "n10" },
  { t: 93, key: "n11" },
  { t: 104, key: "n12" },
  { t: 115, key: "n13" },
];

const NARRATION_AUDIO: Record<string, Record<string, string>> = {
  en: Object.fromEntries(NARRATION_SEGMENTS.map((s) => [s.key, `/audio/narration/en/${s.key}.mp3`])),
  hi: Object.fromEntries(NARRATION_SEGMENTS.map((s) => [s.key, `/audio/narration/hi/${s.key}.mp3`])),
  hinglish: Object.fromEntries(NARRATION_SEGMENTS.map((s) => [s.key, `/audio/narration/hinglish/${s.key}.mp3`])),
};

const LANG_LABEL: Record<string, string> = { en: "EN", hi: "हिंदी", hinglish: "हिंग्लिश" };
const LANG_ORDER: string[] = ["en", "hi", "hinglish"];

export default function SimulatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firIdx = useMemo(() => {
    const f = searchParams.get("fir");
    return f && Number.isFinite(Number(f)) ? Number(f) : 4;
  }, [searchParams]);
  const initialT = useMemo(() => {
    const t = searchParams.get("t");
    return t && Number.isFinite(Number(t)) ? Number(t) : 0;
  }, [searchParams]);

  const [data, setData] = useState<SimData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const controller = useRef<SimController>({ t: 0, playing: true, speed: 1, autoCam: true });
  const [autoCam, setAutoCam] = useState(true);
  useEffect(() => {
    controller.current.autoCam = autoCam;
  }, [autoCam]);
  const emitRef = useRef(0);
  const lastPlayedRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // case picker — every FIR now has a derivable replay, so let people jump
  // between them instead of only ever landing on the flagship robbery
  const [firList, setFirList] = useState<FirSummary[]>([]);
  useEffect(() => {
    fetch("/api/firs")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: FirSummary[]) => setFirList(list))
      .catch(() => {});
  }, []);
  const goToCase = (idx: number) => router.push(`/simulate?fir=${idx}`);

  useEffect(() => {
    let alive = true;
    controller.current.t = 0;
    const t0 = initialT;
    audioRef.current?.pause();
    lastPlayedRef.current = null;
    fetch(`/api/simulation?fir=${firIdx}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no simulation"))))
      .then((d: SimData) => {
        if (!alive) return;
        setError(null);
        setData(d);
        setTime(t0);
        setPlaying(true);
        emitRef.current = t0;
        controller.current.t = t0;
      })
      .catch(() => alive && setError("No replay available for that case."));
    return () => {
      alive = false;
    };
  }, [firIdx, initialT]);

  useEffect(() => {
    controller.current.playing = playing;
  }, [playing]);
  useEffect(() => {
    controller.current.speed = speed;
  }, [speed]);

  const onTime = (t: number) => {
    if (t - emitRef.current > 0.1 || t < emitRef.current) {
      emitRef.current = t;
      setTime(t);
    }
  };
  const onFire = () => {};

  const feed = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => !e.ambient && e.t <= time);
  }, [data, time]);

  const activePhase = useMemo(() => {
    if (!data) return null;
    return data.phases.find((p) => time >= p.start && time < p.end) ?? null;
  }, [data, time]);

  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [feed.length]);

  const seek = (v: number) => {
    controller.current.t = v;
    emitRef.current = v;
    setTime(v);
  };

  const restart = () => {
    lastPlayedRef.current = null;
    seek(0);
    setPlaying(true);
  };

  const toggleSpeed = () => {
    const i = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  };

  // --- suspense narration — FIR 1201/2023 has produced 3-language voice-over
  // tuned to its exact beats; every other case gets on-screen captions built
  // straight from that case's own real narrative/summary instead (there's no
  // recorded audio for it, and playing the robbery's narration over a
  // different case's replay would be actively wrong).
  const isBespoke = !!data?.bespoke;
  const [voiceOn, setVoiceOn] = useState(true);
  const [lang, setLang] = useState<string>("en");
  const [narrationMissing, setNarrationMissing] = useState(false);
  useEffect(() => {
    if (!isBespoke || !voiceOn || !playing) return;
    let seg = NARRATION_SEGMENTS[0];
    for (const s of NARRATION_SEGMENTS) if (time >= s.t) seg = s;
    const playKey = `${lang}:${seg.key}`;
    if (lastPlayedRef.current === playKey) return;
    lastPlayedRef.current = playKey;
    const src = NARRATION_AUDIO[lang][seg.key];
    if (!src) return;
    audioRef.current?.pause();
    const a = new Audio(src);
    audioRef.current = a;
    a.onerror = () => setNarrationMissing(true);
    a.volume = 1;
    a.play().catch(() => {});
  }, [time, voiceOn, playing, lang, isBespoke]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // generic captions — derived from this case's own phases/events, keyed to
  // the same phase boundaries every replay shares (0 premeditation, 54 the
  // offense, 64 escape, 84 money trail)
  const captions = useMemo(() => {
    if (!data || isBespoke) return [];
    const offense = data.events.find((e) => e.kind === "offense");
    const hasMoney = data.events.some((e) => e.kind === "money");
    const hasEscape = data.events.some((e) => e.kind !== "offense" && e.t >= 64 && e.t < 84);
    return [
      { t: 0, text: data.summary },
      { t: 54, text: offense?.sub || data.title },
      { t: 64, text: hasEscape ? "Communications continue in the hours after the incident." : "The trail goes quiet after the incident." },
      { t: 84, text: hasMoney ? "Following the money trail." : "No further financial movement recorded." },
      { t: 116, text: "Case file closed — cross-referenced against the wider network." },
    ];
  }, [data, isBespoke]);
  const currentCaption = useMemo(() => {
    if (!captions.length) return null;
    let c = captions[0];
    for (const seg of captions) if (time >= seg.t) c = seg;
    return c.text;
  }, [captions, time]);

  // --- fade to black around the interior cut (bespoke Act 2 only)
  const fade = useMemo(() => {
    if (!data || !isBespoke) return 0;
    const ramp = (t: number, c: number, half: number) => Math.max(0, Math.min(1, 1 - Math.abs(t - c) / half));
    return Math.max(ramp(time, 53.9, 0.9), ramp(time, 64.1, 0.9));
  }, [data, time, isBespoke]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05060b] text-neutral-100">
      {data ? (
        <SimScene data={data} controller={controller} onTime={onTime} onFire={onFire} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            {error ? (
              <>
                <div className="text-sm text-neutral-400">{error}</div>
                <Link href="/cases" className="mt-3 inline-block text-sm text-white underline">
                  Back to cases
                </Link>
              </>
            ) : (
              <div className="text-sm text-neutral-500">Building replay…</div>
            )}
          </div>
        </div>
      )}

      {/* fade-to-black cut */}
      <div className="pointer-events-none absolute inset-0 z-30 bg-black" style={{ opacity: fade }} />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-5">
        <div className="pointer-events-auto">
          <div className="flex items-center gap-3">
            <Link
              href="/cases"
              className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-neutral-300 backdrop-blur transition hover:border-white/30 hover:text-white"
            >
              ← Cases
            </Link>
            {firList.length > 0 ? (
              <select
                value={firIdx}
                onChange={(e) => goToCase(Number(e.target.value))}
                title="Switch replay"
                className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs tracking-wide text-neutral-300 backdrop-blur transition hover:border-white/30 hover:text-white focus:outline-none"
              >
                {firList.map((f) => (
                  <option key={f.idx} value={f.idx} className="bg-neutral-900 text-neutral-200">
                    FIR {f.fir_no} — {f.title.slice(0, 42)}
                    {f.title.length > 42 ? "…" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs tracking-wide text-neutral-300 backdrop-blur">
                FIR {data?.firNo ?? "…"}
              </div>
            )}
            {!isBespoke && data && (
              <div className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-300 backdrop-blur">
                Derived from real evidence
              </div>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight drop-shadow">
            {data?.title ?? "Loading replay…"}
          </h1>
          {data && (
            <p className="mt-1 max-w-md text-sm text-neutral-400">
              {data.date} {data.time && `· ${data.time}`}
            </p>
          )}
        </div>

        {data && activePhase && (
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-right backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Phase</div>
            <div className="text-base font-semibold" style={{ color: activePhase.color }}>
              {activePhase.label}
            </div>
          </div>
        )}
      </div>

      {/* legend */}
      {data && (
        <div className="pointer-events-none absolute bottom-32 right-5 z-20 hidden w-60 md:block">
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/50 p-3 backdrop-blur">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Persons of interest
            </div>
            <div className="space-y-1.5">
              {data.actors.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs text-neutral-300">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }}
                  />
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto text-[10px] text-neutral-500">{a.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* evidence feed */}
      {data && (
        <div className="pointer-events-none absolute bottom-32 left-5 z-20 hidden w-80 md:block">
          <div className="pointer-events-auto flex max-h-56 flex-col rounded-2xl border border-white/10 bg-black/55 backdrop-blur">
            <div className="border-b border-white/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Evidence feed
            </div>
            <div ref={feedRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
              {feed.length === 0 && (
                <div className="px-1 py-2 text-xs text-neutral-600">Awaiting events…</div>
              )}
              {feed.map((e, i) => {
                const active = time >= e.t && time <= e.t + e.dur;
                return (
                  <div
                    key={i}
                    className={`rounded-lg px-2.5 py-1.5 text-xs transition ${
                      active ? "bg-white/10 text-white" : "text-neutral-400"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-neutral-500">
                      {e.t.toFixed(0)}s
                    </span>{" "}
                    {e.label}
                    {e.sub && <span className="text-neutral-500"> · {e.sub}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* caption bar — recorded VO handles this for the bespoke case; every
          other case gets its real-evidence summary as on-screen text */}
      {!isBespoke && voiceOn && currentCaption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-5">
          <p className="max-w-2xl rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-center text-sm leading-snug text-neutral-100 backdrop-blur">
            {currentCaption}
          </p>
        </div>
      )}

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-5">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              onClick={restart}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-neutral-200 transition hover:border-white/40"
              aria-label="Restart"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              onClick={toggleSpeed}
              className="h-11 rounded-full border border-white/15 px-4 text-sm font-medium text-neutral-200 transition hover:border-white/40"
            >
              {speed}×
            </button>
            <button
              onClick={() => {
                seek(54);
                setPlaying(true);
              }}
              className="h-11 rounded-full border border-red-400/40 bg-red-500/10 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
            >
              {isBespoke ? "Skip to robbery →" : "Skip to the offense →"}
            </button>
            <button
              onClick={() => setVoiceOn((v) => !v)}
              className={`h-11 rounded-full border px-4 text-sm font-medium transition ${
                voiceOn
                  ? "border-white/30 bg-white/10 text-white"
                  : "border-white/15 text-neutral-400 hover:border-white/40"
              }`}
              title={isBespoke ? "Toggle voice narration" : "Toggle on-screen captions"}
            >
              {voiceOn ? (isBespoke ? "Narration on" : "Captions on") : isBespoke ? "Narration off" : "Captions off"}
            </button>
            {isBespoke && (
              <button
                onClick={() => setLang((l) => LANG_ORDER[(LANG_ORDER.indexOf(l) + 1) % LANG_ORDER.length])}
                className="h-11 rounded-full border border-white/15 px-4 text-sm font-medium text-neutral-200 transition hover:border-white/40"
                title="Narration language"
              >
                {LANG_LABEL[lang] ?? "EN"}
              </button>
            )}
            <button
              onClick={() => setAutoCam(true)}
              className={`h-11 rounded-full border px-4 text-sm font-medium transition ${
                autoCam
                  ? "border-white/15 text-neutral-400 hover:border-white/40"
                  : "border-sky-400/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
              }`}
              title="Re-enable cinematic camera (drag the scene to orbit, scroll to zoom)"
            >
              {autoCam ? "Auto cam" : "Auto cam ↺"}
            </button>
            <div className="ml-auto font-mono text-sm tabular-nums text-neutral-400">
              {time.toFixed(1)}s / {data?.duration ?? 0}s
            </div>
          </div>
          {narrationMissing && isBespoke && (
            <p className="mt-2 text-[11px] text-amber-300/80">
              Narration audio not found — add tracks to <span className="font-mono">public/audio/narration/</span>.
            </p>
          )}

          {/* phase ribbon + scrubber */}
          <div className="relative">
            <div className="mb-1 flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              {data?.phases.map((p) => (
                <div
                  key={p.key}
                  className="h-full"
                  style={{
                    width: `${((p.end - p.start) / (data?.duration ?? 1)) * 100}%`,
                    background: p.color,
                    opacity: activePhase?.key === p.key ? 1 : 0.4,
                  }}
                />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={data?.duration ?? 1}
              step={0.05}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              className="timeline-range w-full"
            />
            <div className="mt-0.5 flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
              {data?.phases.map((p) => (
                <button
                  key={p.key}
                  onClick={() => seek(p.start)}
                  className="cursor-pointer px-1 transition hover:text-white"
                  style={{ color: activePhase?.key === p.key ? p.color : undefined }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .timeline-range {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: transparent;
          cursor: pointer;
        }
        .timeline-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: none;
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
          cursor: pointer;
        }
        .timeline-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: none;
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
