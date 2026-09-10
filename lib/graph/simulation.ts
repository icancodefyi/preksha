import { burner, cdr, financial, firs, memberByPhone, networkMembers, towerDump, towers } from "@/lib/data/seed";
import { firstSentences } from "@/lib/graph/engine";
import type { FIRRecord } from "@/lib/data/types";

// ---------------------------------------------------------------------------
// INCIDENT REPLAY — a deterministic, evidence-driven storyboard that turns the
// real FIR + CDR + tower-dump + financial records into a timed 3D replay.
//
// FIR 1201/2023 (Dadar jewellery robbery) keeps a fully bespoke, hand-timed
// cinematic sequence (buildDadarSimulation, below) — it has a custom interior
// set, getaway choreography and produced 3-language voice-over tuned to its
// exact beats. Every other FIR goes through buildGenericSimulation, which
// derives the same shape of story (who was where, who called whom, where the
// money went) straight from that FIR's own real CDR/tower-dump/financial
// records — the same evidentiary windows reconstructCrime() in enrich.ts
// uses, just projected into a 3D timeline instead of text steps. SimScene
// reads `bespoke` to decide whether to render the custom Act 2 or the
// generic offense/escape beats.
// ---------------------------------------------------------------------------

export interface SimTower {
  id: string;
  name: string;
  x: number;
  z: number;
  lat: number;
  lng: number;
  scene: boolean;
}

export type SimActorKind = "member" | "remote" | "entity";

export interface SimActor {
  id: string;
  name: string;
  role: string;
  phone: string;
  color: string;
  kind: SimActorKind;
  pos: { x: number; z: number } | null;
}

export interface SimKeyframe {
  t: number;
  towerId: string | null;
  enter?: boolean;
}

export type SimEventKind = "call" | "ping" | "money" | "offense" | "note";

export interface SimEvent {
  t: number;
  dur: number;
  kind: SimEventKind;
  a?: string;
  b?: string;
  towerId?: string;
  label: string;
  sub?: string;
  ambient?: boolean;
}

export interface SimPhase {
  key: string;
  label: string;
  start: number;
  end: number;
  color: string;
}

export interface SimData {
  firNo: string;
  title: string;
  date: string;
  time: string;
  summary: string;
  duration: number;
  scene: { x: number; z: number };
  towers: SimTower[];
  actors: SimActor[];
  keyframes: Record<string, SimKeyframe[]>;
  events: SimEvent[];
  phases: SimPhase[];
  /** true only for the flagship FIR 1201/2023 — gates the custom interior/getaway Act in SimScene */
  bespoke: boolean;
}

const TOTAL = 124;
const DAY = 86400000;

function D(s: string): number {
  return new Date(s.replace(" ", "T")).getTime();
}

function jitter(id: string, salt: number): { x: number; z: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r = (n: number) => {
    const v = Math.sin((h + n) * 127.1 + salt * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  return { x: (r(1) - 0.5) * 1.7, z: (r(2) - 0.5) * 1.7 };
}

function project(cityTowers: typeof towers): (lat: number, lng: number) => { x: number; z: number } {
  const lats = cityTowers.map((t) => t.lat);
  const lngs = cityTowers.map((t) => t.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  return (lat, lng) => ({
    x: ((lng - minLng) / spanLng) * 24 - 12,
    z: -((lat - minLat) / spanLat) * 16 + 8,
  });
}

function projectTowers(cityTowers: typeof towers, sceneIds: Set<string>): SimTower[] {
  const proj = project(cityTowers);
  return cityTowers.map((t, i) => {
    const p = proj(t.lat, t.lng);
    const j = jitter(t.cell_id, i);
    return {
      id: t.cell_id,
      name: t.tower,
      x: p.x + j.x,
      z: p.z + j.z,
      lat: t.lat,
      lng: t.lng,
      scene: sceneIds.has(t.cell_id),
    };
  });
}

// ---------------------------------------------------------------------------
// GENERIC — works for any FIR, entirely from real records
// ---------------------------------------------------------------------------

const DISTRICT_TO_CITY: Record<string, string> = { "New Delhi": "Delhi" };

/** Best-effort real-world city for a FIR: tagged evidence towers first (ground
 * truth), then a place name matched against known tower cities, then the
 * FIR's own district. */
function cityForFir(fir: FIRRecord): string | null {
  const knownCities = [...new Set(towers.map((t) => t.city))];

  const evTowers = fir.evidence?.towers ?? [];
  if (evTowers.length) {
    const counts = new Map<string, number>();
    for (const id of evTowers) {
      const c = towers.find((t) => t.cell_id === id)?.city;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  for (const place of fir.entities?.places ?? []) {
    const hit = knownCities.find((c) => place.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }

  const d = DISTRICT_TO_CITY[fir.district] ?? fir.district;
  return knownCities.includes(d) ? d : null;
}

/** A real, case-specific name for the scene building — the first place named
 * in the FIR (a street/locality), falling back to the police station —
 * instead of the bare cell-tower ID every background building uses. */
function sceneLocationName(fir: FIRRecord): string {
  return fir.entities?.places?.[0] || fir.police_station;
}

interface Candidate {
  key: string;
  name: string;
  role: string;
  phone: string;
  isBurner: boolean;
}

/** Every phone/name this FIR actually names, resolved to a known identity —
 * the same phone/name matching lib/data/cases.ts's deriveSuspectKeys() uses. */
function resolveCandidates(fir: FIRRecord): Candidate[] {
  const found = new Map<string, Candidate>();
  const phones = new Set<string>([...(fir.entities?.phones ?? []), ...(fir.evidence?.phones ?? [])]);
  for (const phone of phones) {
    if (phone === burner.phone) {
      found.set("burner", { key: "burner", name: "Unknown (burner)", role: "Burner device", phone, isBurner: true });
      continue;
    }
    const m = memberByPhone(phone);
    if (m) found.set(m.key, { key: m.key, name: m.name, role: m.role, phone: m.phone, isBurner: false });
  }
  const names = new Set<string>([fir.complainant?.name, ...fir.accused.map((a) => a.name)].filter(Boolean) as string[]);
  for (const name of names) {
    const m = networkMembers.find((nm) => nm.name === name);
    if (m && !found.has(m.key)) {
      found.set(m.key, { key: m.key, name: m.name, role: m.role, phone: m.phone, isBurner: false });
    }
  }
  return [...found.values()];
}

interface Hit {
  t: number;
  cell: string;
}

const PALETTE = ["#f43f5e", "#fbbf24", "#22d3ee", "#a78bfa", "#34d399", "#fb7185", "#60a5fa", "#f472b6"];

export function buildGenericSimulation(fir: FIRRecord): SimData | null {
  const candidates = resolveCandidates(fir);
  if (candidates.length === 0) return null;

  const cityName = cityForFir(fir);
  let cityTowers = cityName ? towers.filter((t) => t.city === cityName) : [];
  if (cityTowers.length === 0) cityTowers = towers.filter((t) => t.city === "Pune"); // defensive fallback, should not trigger
  const cityTowerIds = new Set(cityTowers.map((t) => t.cell_id));

  const incidentMs = D(`${fir.incident_date} ${fir.incident_time && fir.incident_time !== "-" ? fir.incident_time : "12:00"}:00`);
  const windowStart = incidentMs - 3 * DAY;
  const windowEnd = incidentMs + 2 * DAY;
  const moneyStart = incidentMs - 5 * DAY;
  const moneyEnd = incidentMs + 10 * DAY;

  // every CDR/tower-dump touch for each candidate phone, within the story window
  const hitsByKey = new Map<string, Hit[]>();
  const push = (key: string, t: number, cell: string | null) => {
    if (!cell) return;
    (hitsByKey.get(key) ?? hitsByKey.set(key, []).get(key)!).push({ t, cell });
  };
  const phoneToKey = new Map(candidates.map((c) => [c.phone, c.key]));

  for (const c of cdr) {
    const t = D(c.timestamp);
    if (t < windowStart || t > windowEnd) continue;
    const callerKey = phoneToKey.get(c.caller);
    const receiverKey = phoneToKey.get(c.receiver);
    if (callerKey) push(callerKey, t, c.caller_cell);
    if (receiverKey) push(receiverKey, t, c.receiver_cell);
  }
  for (const d of towerDump) {
    const key = phoneToKey.get(d.phone);
    if (!key) continue;
    const t = D(d.timestamp);
    if (t < windowStart || t > windowEnd) continue;
    push(key, t, d.cell_id);
  }
  for (const [, hits] of hitsByKey) hits.sort((a, b) => a.t - b.t);

  // classify: physically in the scene city > in comms with someone who is > financial-only
  const callPairs: { t: number; a: string; b: string; dur: number }[] = [];
  for (const c of cdr) {
    const t = D(c.timestamp);
    if (t < windowStart || t > windowEnd) continue;
    const a = phoneToKey.get(c.caller);
    const b = phoneToKey.get(c.receiver);
    if (a && b && a !== b) callPairs.push({ t, a, b, dur: c.duration_sec });
  }
  const inComms = new Set<string>();
  for (const p of callPairs) {
    inComms.add(p.a);
    inComms.add(p.b);
  }

  const moneyRows = financial.filter((t) => {
    if (t.remark === "internal") return false;
    const d = D(t.date);
    return d >= moneyStart && d <= moneyEnd;
  });
  const nameToKey = new Map(candidates.map((c) => [c.name, c.key]));
  const moneyPairs = moneyRows
    .map((t) => ({ ...t, aKey: nameToKey.get(t.from_name), bKey: nameToKey.get(t.to_name) }))
    .filter((t) => t.aKey && t.bKey && t.aKey !== t.bKey) as (typeof moneyRows[number] & { aKey: string; bKey: string })[];
  const inMoney = new Set<string>();
  for (const p of moneyPairs) {
    inMoney.add(p.aKey);
    inMoney.add(p.bKey);
  }

  const classified = candidates.map((c) => {
    const hits = hitsByKey.get(c.key) ?? [];
    const inCity = hits.some((h) => cityTowerIds.has(h.cell));
    const kind: SimActorKind = inCity ? "member" : inComms.has(c.key) ? "remote" : "entity";
    return { ...c, hits, kind, weight: hits.length + (inComms.has(c.key) ? 5 : 0) + (inMoney.has(c.key) ? 3 : 0) };
  });
  // guarantee at least one figure physically on-scene when any evidence exists at all
  if (!classified.some((c) => c.kind === "member") && classified.some((c) => c.hits.length > 0)) {
    const best = classified.reduce((a, b) => (b.hits.length > a.hits.length ? b : a));
    best.kind = "member";
  }

  const ranked = [...classified].sort((a, b) => {
    const rank = (k: SimActorKind) => (k === "member" ? 0 : k === "remote" ? 1 : 2);
    return rank(a.kind) - rank(b.kind) || b.weight - a.weight;
  });
  const chosen = ranked.slice(0, 7);
  const chosenKeys = new Set(chosen.map((c) => c.key));

  const sceneIds = new Set<string>(fir.evidence?.towers ?? []);
  const towersOut = projectTowers(cityTowers, sceneIds);
  const towerById = new Map(towersOut.map((t) => [t.id, t]));

  let scene: { x: number; z: number };
  let sceneTowers = towersOut.filter((t) => t.scene);
  if (sceneTowers.length) {
    scene = {
      x: sceneTowers.reduce((s, t) => s + t.x, 0) / sceneTowers.length,
      z: sceneTowers.reduce((s, t) => s + t.z, 0) / sceneTowers.length,
    };
  } else {
    // epicenter fallback: the most-visited in-city tower across every chosen
    // actor, promoted to the same "scene" treatment (taller building, real
    // name, orange marker) a tagged evidence tower gets — otherwise a case
    // with no evidence.towers has no distinguishable scene building at all.
    const freq = new Map<string, number>();
    for (const c of chosen) for (const h of c.hits) if (cityTowerIds.has(h.cell)) freq.set(h.cell, (freq.get(h.cell) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const t = top ? towerById.get(top) : towersOut[0];
    if (t) t.scene = true;
    sceneTowers = t ? [t] : [];
    scene = t ? { x: t.x, z: t.z } : { x: 0, z: 0 };
  }
  if (sceneTowers.length) {
    const locationName = sceneLocationName(fir);
    for (const t of sceneTowers) t.name = locationName;
  }

  // off-scene column for remote/entity actors, west of the city
  const minX = Math.min(...towersOut.map((t) => t.x), scene.x);
  const hqX = minX - 4;
  const offScene = chosen.filter((c) => c.kind !== "member");
  const hqPos = new Map<string, { x: number; z: number }>();
  offScene.forEach((c, i) => hqPos.set(c.key, { x: hqX, z: (i - (offScene.length - 1) / 2) * 3.4 }));

  const actors: SimActor[] = chosen.map((c, i) => ({
    id: c.key,
    name: c.name,
    role: c.isBurner ? "Burner device" : c.role,
    phone: c.phone,
    color: c.isBurner ? "#ef4444" : PALETTE[i % PALETTE.length],
    kind: c.kind,
    pos: c.kind === "member" ? null : hqPos.get(c.key) ?? { x: hqX, z: 0 },
  }));

  // time mapping: pre-incident comms -> [0,53.5], post-incident comms -> [64,84], money -> [84,116]
  const preHits: number[] = [];
  const postHits: number[] = [];
  for (const c of chosen) for (const h of c.hits) (h.t <= incidentMs ? preHits : postHits).push(h.t);
  for (const p of callPairs) (chosenKeys.has(p.a) && chosenKeys.has(p.b) ? (p.t <= incidentMs ? preHits : postHits) : []).push(p.t);
  const preMin = preHits.length ? Math.min(...preHits) : incidentMs - DAY;
  const postMax = postHits.length ? Math.max(...postHits) : incidentMs + DAY;
  const moneyTimes = moneyPairs.filter((p) => chosenKeys.has(p.aKey) && chosenKeys.has(p.bKey)).map((p) => D(p.date));
  const moneyMin = moneyTimes.length ? Math.min(...moneyTimes) : incidentMs - DAY;
  const moneyMax = moneyTimes.length ? Math.max(...moneyTimes) : incidentMs + DAY;

  const commsToSim = (t: number) => {
    if (t <= incidentMs) {
      const u = Math.max(0, Math.min(1, (t - preMin) / Math.max(incidentMs - preMin, 1)));
      return u * 53.5;
    }
    const u = Math.max(0, Math.min(1, (t - incidentMs) / Math.max(postMax - incidentMs, 1)));
    return 64 + u * 20;
  };
  const moneyToSim = (t: number) => {
    const u = Math.max(0, Math.min(1, (t - moneyMin) / Math.max(moneyMax - moneyMin, 1)));
    return 84 + u * 32;
  };

  // keyframes — every chosen member's real cell-tower trail, in city-known
  // towers only. A minimum gap between stops is enforced: real hits often
  // cluster within seconds of each other (several calls off the same tower
  // in a burst), and without thinning those the figure would warp between
  // towers almost instantly — technically "accurate" to the raw timestamps
  // but reads as a glitch, not movement.
  const MIN_KEYFRAME_GAP = 3;
  const keyframes: Record<string, SimKeyframe[]> = {};
  for (const c of chosen) {
    if (c.kind !== "member") {
      keyframes[c.key] = [];
      continue;
    }
    const inCity = c.hits.filter((h) => cityTowerIds.has(h.cell));
    const kfs: SimKeyframe[] = [];
    let lastCell: string | null = null;
    for (const h of inCity) {
      if (h.cell === lastCell) continue;
      const t = commsToSim(h.t);
      if (kfs.length && t - kfs[kfs.length - 1].t < MIN_KEYFRAME_GAP) continue;
      lastCell = h.cell;
      kfs.push({ t, towerId: h.cell, enter: kfs.length === 0 });
    }
    keyframes[c.key] = kfs;
  }

  // events
  const events: SimEvent[] = [];
  const nameOf = new Map(chosen.map((c) => [c.key, c.name]));

  const seenCalls = new Set<string>();
  for (const p of callPairs) {
    if (!chosenKeys.has(p.a) || !chosenKeys.has(p.b)) continue;
    const k = `${Math.round(p.t / 1000)}|${p.a}|${p.b}`;
    if (seenCalls.has(k)) continue;
    seenCalls.add(k);
    events.push({
      t: commsToSim(p.t),
      dur: 2.4,
      kind: "call",
      a: p.a,
      b: p.b,
      label: `${nameOf.get(p.a)} ↔ ${nameOf.get(p.b)}`,
      sub: `${p.dur}s call`,
    });
  }
  // cap call volume for readability — spread evenly across the sorted list rather than truncating
  events.sort((a, b) => a.t - b.t);
  const calls = events.filter((e) => e.kind === "call");
  if (calls.length > 16) {
    const keep = new Set<number>();
    for (let i = 0; i < 16; i++) keep.add(Math.round((i * (calls.length - 1)) / 15));
    let idx = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].kind !== "call") continue;
      if (!keep.has(calls.length - 1 - idx)) events.splice(i, 1);
      idx++;
    }
  }

  for (const c of chosen) {
    if (c.kind !== "member") continue;
    for (const h of c.hits) {
      if (!cityTowerIds.has(h.cell)) continue;
      events.push({
        t: commsToSim(h.t),
        dur: 2.2,
        kind: "ping",
        towerId: h.cell,
        a: c.key,
        label: `${c.name} pinged ${h.cell}`,
        sub: "tower dump",
      });
    }
  }

  events.push({
    t: 58,
    dur: 6,
    kind: "offense",
    towerId: sceneTowers[0]?.id,
    label: fir.title,
    sub: firstSentences(fir.narrative, 1),
  });

  for (const p of moneyPairs) {
    if (!chosenKeys.has(p.aKey) || !chosenKeys.has(p.bKey)) continue;
    events.push({
      t: moneyToSim(D(p.date)),
      dur: 3.5,
      kind: "money",
      a: p.aKey,
      b: p.bKey,
      label: `${nameOf.get(p.aKey)} → ${nameOf.get(p.bKey)}`,
      sub: `₹${Math.round(p.amount).toLocaleString("en-IN")}`,
    });
  }

  // ambient crowd — other real phones pinging the scene city's towers in-window
  let ambientCount = 0;
  for (const d of towerDump) {
    if (phoneToKey.has(d.phone)) continue;
    if (!cityTowerIds.has(d.cell_id)) continue;
    const t = D(d.timestamp);
    if (t < windowStart || t > windowEnd) continue;
    if (ambientCount++ % 2 !== 0) continue;
    events.push({ t: commsToSim(t), dur: 1.2, kind: "ping", towerId: d.cell_id, label: "", ambient: true });
    if (ambientCount > 120) break;
  }

  const phases: SimPhase[] = [
    { key: "premed", label: "Premeditation", start: 0, end: 16, color: "#8b8b9e" },
    { key: "approach", label: "Approach", start: 16, end: 54, color: "#fbbf24" },
    { key: "offense", label: "The Offense", start: 54, end: 62, color: "#f43f5e" },
    { key: "escape", label: "Escape", start: 62, end: 84, color: "#22d3ee" },
    { key: "money", label: "Money Trail", start: 84, end: 116, color: "#34d399" },
    { key: "close", label: "Case Closed", start: 116, end: TOTAL, color: "#8b8b9e" },
  ];

  events.sort((a, b) => a.t - b.t);

  return {
    firNo: fir.fir_no,
    title: fir.title,
    date: fir.incident_date,
    time: fir.incident_time === "-" ? "" : fir.incident_time,
    summary: firstSentences(fir.narrative, 2),
    duration: TOTAL,
    scene,
    towers: towersOut,
    actors,
    keyframes,
    events,
    phases,
    bespoke: false,
  };
}

// ---------------------------------------------------------------------------
// BESPOKE — FIR 1201/2023, the Dadar jewellery robbery. Fully hand-timed:
// every keyframe/call/ping/money event below is a real CDR / tower-dump /
// financial record for this exact case, hand-placed to the second so the
// produced 3-language narration (public/audio/narration/) and SimScene's
// custom interior-heist Act line up precisely. Do not touch the timings
// without re-cutting the narration audio to match.
// ---------------------------------------------------------------------------

// piecewise-linear mapping from real time (ms) to sim seconds
const SEGS: { t0: number; s0: number; t1: number; s1: number }[] = [
  { t0: D("2023-11-12T00:00:00"), s0: 0, t1: D("2023-11-14T18:00:00"), s1: 16 },
  { t0: D("2023-11-14T18:00:00"), s0: 16, t1: D("2023-11-14T20:05:00"), s1: 54 },
  { t0: D("2023-11-14T20:05:00"), s0: 54, t1: D("2023-11-14T20:07:00"), s1: 60 },
  { t0: D("2023-11-14T20:07:00"), s0: 60, t1: D("2023-11-14T22:30:00"), s1: 84 },
  { t0: D("2023-11-14T22:30:00"), s0: 84, t1: D("2023-11-17T20:00:00"), s1: 116 },
];

function toSim(ms: number): number {
  for (const s of SEGS) {
    if (ms <= s.t1) return s.s0 + ((s.s1 - s.s0) * (ms - s.t0)) / (s.t1 - s.t0);
  }
  return TOTAL;
}

const C = {
  rajesh: "#f43f5e",
  rajesh2: "#fb7185",
  mohammed: "#fbbf24",
  ravi: "#22d3ee",
  santosh: "#a78bfa",
  shell: "#34d399",
  priya: "#34d399",
  hq: "#f43f5e",
};

// the four phones that tie real people to the scene
const SCENE_PHONES = new Set(["9890055667", "9021011223", "9422022334", "9009010010"]);

function buildDadarSimulation(fir: FIRRecord): SimData {
  const mum = towers.filter((t) => t.cell_id.startsWith("MUM-"));

  const sceneIds = new Set<string>(fir.evidence?.towers ?? []);
  const towersOut = projectTowers(mum, sceneIds);

  const sceneA = towersOut.find((t) => t.id === "MUM-008") ?? towersOut[0];
  const sceneB = towersOut.find((t) => t.id === "MUM-009") ?? towersOut[1];
  const scene = { x: (sceneA.x + sceneB.x) / 2, z: (sceneA.z + sceneB.z) / 2 };
  const dadarLocationName = sceneLocationName(fir);
  sceneA.name = dadarLocationName;
  sceneB.name = dadarLocationName;

  const actor = (
    id: string,
    name: string,
    role: string,
    phone: string,
    color: string,
    kind: SimActorKind,
    pos: { x: number; z: number } | null = null,
  ): SimActor => ({ id, name, role, phone, color, kind, pos });

  const actors: SimActor[] = [
    actor("rajesh", "Rajesh Kumar", "Kingpin (directing from Pune)", "9821045451", C.rajesh, "remote", {
      x: -14.5,
      z: -7.2,
    }),
    actor("rajesh2", "Rajesh Kumar · 2nd SIM", "Kingpin's second SIM", "9009010010", C.rajesh2, "member"),
    actor("mohammed", "Mohammed Ali", "Drug courier · on scene", "9890055667", C.mohammed, "member"),
    actor("ravi", "Ravi Patel", "Executor / thief", "9021011223", C.ravi, "member"),
    actor("santosh", "Santosh Yadav", "Executor / arms", "9422022334", C.santosh, "member"),
    actor("nisha", "Nisha Traders", "Shell entity (laundering)", "—", C.shell, "entity", { x: -14.5, z: -1.2 }),
    actor("priya", "Priya Nair", "Financier (CA)", "9819077889", C.priya, "entity", { x: -14.5, z: 2.8 }),
  ];

  const kf = (): SimKeyframe[] => [];
  const keyframes: Record<string, SimKeyframe[]> = {
    rajesh: [],
    rajesh2: kf(),
    mohammed: kf(),
    ravi: kf(),
    santosh: kf(),
    nisha: [],
    priya: [],
  };

  const K = (id: string, ts: string, towerId: string, enter = false) =>
    keyframes[id].push({ t: toSim(D(ts)), towerId, enter });

  // device keyframes — every endpoint is a real CDR cell or tower-dump ping
  K("mohammed", "2023-11-14 11:10:00", "MUM-003", true);
  K("mohammed", "2023-11-14 14:55:00", "MUM-007");
  K("mohammed", "2023-11-14 19:04:19", "MUM-008");
  K("mohammed", "2023-11-14 20:27:56", "MUM-008");
  K("mohammed", "2023-11-14 20:33:57", "MUM-008");

  K("rajesh2", "2023-11-14 19:45:56", "MUM-008", true);
  K("rajesh2", "2023-11-14 20:51:23", "MUM-009");

  K("santosh", "2023-11-14 19:40:34", "MUM-009", true);
  K("santosh", "2023-11-14 20:14:11", "MUM-009");

  K("ravi", "2023-11-14 20:07:09", "MUM-009", true);
  K("ravi", "2023-11-14 20:31:23", "MUM-008");
  K("ravi", "2023-11-14 20:57:26", "MUM-008");

  const events: SimEvent[] = [];
  const call = (ts: string, a: string, b: string, dur: number, label: string) =>
    events.push({ t: toSim(D(ts)), dur: 2.4, kind: "call", a, b, label, sub: `${dur}s call` });

  // premeditation + final coordination (real CDR records)
  call("2023-11-12 21:03:39", "rajesh", "mohammed", 90, "Rajesh calls Mohammed Ali");
  call("2023-11-14 11:10:00", "mohammed", "ravi", 90, "Mohammed ↔ Ravi Patel");
  call("2023-11-14 12:12:00", "ravi", "santosh", 600, "Ravi ↔ Santosh (10 min)");
  call("2023-11-14 14:55:00", "mohammed", "ravi", 600, "Mohammed ↔ Ravi (10 min)");
  call("2023-11-14 16:46:00", "ravi", "santosh", 300, "Ravi ↔ Santosh (5 min)");
  call("2023-11-14 19:11:00", "rajesh", "mohammed", 60, "Rajesh directs Mohammed");
  call("2023-11-14 19:18:00", "rajesh", "mohammed", 120, "Rajesh directs Mohammed");
  call("2023-11-14 19:31:00", "rajesh", "mohammed", 90, "Rajesh directs Mohammed");
  call("2023-11-14 20:00:00", "santosh", "mohammed", 40, "Santosh → Mohammed (the 'go' call)");
  call("2023-11-14 22:22:23", "rajesh", "mohammed", 18, "Rajesh ↔ Mohammed (aftermath)");
  call("2023-11-14 23:04:00", "santosh", "mohammed", 40, "Santosh ↔ Mohammed (aftermath)");

  // presence evidence — real tower-dump pings tying each device to the scene
  const ping = (ts: string, actorId: string, towerId: string) => {
    const a = actors.find((x) => x.id === actorId);
    events.push({
      t: toSim(D(ts)),
      dur: 2.2,
      kind: "ping",
      towerId,
      a: actorId,
      label: `${a?.name ?? actorId} pinged ${towerId}`,
      sub: "tower dump",
    });
  };
  ping("2023-11-14 19:04:19", "mohammed", "MUM-008");
  ping("2023-11-14 19:40:34", "santosh", "MUM-009");
  ping("2023-11-14 19:45:56", "rajesh2", "MUM-008");
  ping("2023-11-14 20:07:09", "ravi", "MUM-009");
  ping("2023-11-14 20:14:11", "santosh", "MUM-009");
  ping("2023-11-14 20:27:56", "mohammed", "MUM-008");
  ping("2023-11-14 20:31:23", "ravi", "MUM-008");
  ping("2023-11-14 20:33:57", "mohammed", "MUM-008");
  ping("2023-11-14 20:51:23", "rajesh2", "MUM-009");
  ping("2023-11-14 20:57:26", "ravi", "MUM-008");

  // the offense
  events.push({
    t: toSim(D("2023-11-14 20:05:00")),
    dur: 6,
    kind: "offense",
    towerId: "MUM-008",
    label: `${fir.title}`,
    sub: "Masked men decamp with ₹22 lakh jewellery — Dadar West",
  });
  const money = (ts: string, a: string, b: string, amt: string, label: string) =>
    events.push({ t: toSim(D(ts)), dur: 3.5, kind: "money", a, b, label, sub: amt });
  money("2023-11-16 00:00:00", "mohammed", "nisha", "₹6,20,000", "Mohammed Ali → Nisha Traders");
  money("2023-11-17 00:00:00", "nisha", "priya", "₹5,40,000", "Nisha Traders → Priya Nair");
  money("2023-11-17 00:00:00", "priya", "rajesh", "₹4,00,000", "Priya Nair → Rajesh Kumar");

  // ambient crowd — real phones from the tower dump, faint flashes
  const involved = new Set(SCENE_PHONES);
  let ambientCount = 0;
  for (const d of towerDump) {
    if (involved.has(d.phone)) continue;
    if (!d.cell_id.startsWith("MUM-")) continue;
    if (ambientCount++ % 2 !== 0) continue; // sample ~half
    const t = toSim(D(d.timestamp));
    if (t < 0 || t > TOTAL) continue;
    events.push({ t, dur: 1.2, kind: "ping", towerId: d.cell_id, label: "", ambient: true });
    if (ambientCount > 120) break;
  }

  // phase markers
  const phases: SimPhase[] = [
    { key: "premed", label: "Premeditation", start: 0, end: 16, color: "#8b8b9e" },
    { key: "approach", label: "Approach", start: 16, end: 54, color: "#fbbf24" },
    { key: "offense", label: "The Offense", start: 54, end: 62, color: "#f43f5e" },
    { key: "escape", label: "Escape", start: 62, end: 84, color: "#22d3ee" },
    { key: "money", label: "Money Trail", start: 84, end: 116, color: "#34d399" },
    { key: "close", label: "Case Closed", start: 116, end: TOTAL, color: "#8b8b9e" },
  ];

  events.sort((a, b) => a.t - b.t);

  return {
    firNo: fir.fir_no,
    title: fir.title,
    date: fir.incident_date,
    time: fir.incident_time === "-" ? "" : fir.incident_time,
    summary: firstSentences(fir.narrative, 2),
    duration: TOTAL,
    scene,
    towers: towersOut,
    actors,
    keyframes,
    events,
    phases,
    bespoke: true,
  };
}

export function buildSimulation(firIdx: number): SimData | null {
  const fir = firs.find((f) => f.idx === firIdx);
  if (!fir) return null;
  return fir.idx === 4 ? buildDadarSimulation(fir) : buildGenericSimulation(fir);
}
