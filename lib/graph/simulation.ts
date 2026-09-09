import { firs, towerDump, towers } from "@/lib/data/seed";

// ---------------------------------------------------------------------------
// INCIDENT REPLAY — a deterministic, evidence-driven storyboard that turns the
// real FIR + CDR + tower-dump + financial records into a timed 3D replay.
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
}

const TOTAL = 124;

// piecewise-linear mapping from real time (ms) to sim seconds
const SEGS: { t0: number; s0: number; t1: number; s1: number }[] = [
  { t0: D("2023-11-12T00:00:00"), s0: 0, t1: D("2023-11-14T18:00:00"), s1: 16 },
  { t0: D("2023-11-14T18:00:00"), s0: 16, t1: D("2023-11-14T20:05:00"), s1: 54 },
  { t0: D("2023-11-14T20:05:00"), s0: 54, t1: D("2023-11-14T20:07:00"), s1: 60 },
  { t0: D("2023-11-14T20:07:00"), s0: 60, t1: D("2023-11-14T22:30:00"), s1: 84 },
  { t0: D("2023-11-14T22:30:00"), s0: 84, t1: D("2023-11-17T20:00:00"), s1: 116 },
];

function D(s: string): number {
  return new Date(s.replace(" ", "T")).getTime();
}

function toSim(ms: number): number {
  for (const s of SEGS) {
    if (ms <= s.t1) return s.s0 + ((s.s1 - s.s0) * (ms - s.t0)) / (s.t1 - s.t0);
  }
  return TOTAL;
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

export function buildSimulation(firIdx: number): SimData | null {
  const fir = firs.find((f) => f.idx === firIdx);
  if (!fir) return null;

  const mum = towers.filter((t) => t.cell_id.startsWith("MUM-"));

  // geographic projection (equirectangular over the Mumbai towers' bounds)
  const lats = mum.map((t) => t.lat);
  const lngs = mum.map((t) => t.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;

  const proj = (lat: number, lng: number) => ({
    x: ((lng - minLng) / spanLng) * 24 - 12,
    z: -((lat - minLat) / spanLat) * 16 + 8,
  });

  const sceneIds = new Set<string>(fir.evidence?.towers ?? []);
  const towersOut: SimTower[] = mum.map((t, i) => {
    const p = proj(t.lat, t.lng);
    const j = jitter(t.cell_id, i);
    const scene = sceneIds.has(t.cell_id);
    return {
      id: t.cell_id,
      name: t.tower,
      x: p.x + j.x,
      z: p.z + j.z,
      lat: t.lat,
      lng: t.lng,
      scene,
    };
  });

  const sceneA = towersOut.find((t) => t.id === "MUM-008") ?? towersOut[0];
  const sceneB = towersOut.find((t) => t.id === "MUM-009") ?? towersOut[1];
  const scene = { x: (sceneA.x + sceneB.x) / 2, z: (sceneA.z + sceneB.z) / 2 };

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
    { key: "offense", label: "The Offense", start: 54, end: 60, color: "#f43f5e" },
    { key: "escape", label: "Escape", start: 60, end: 84, color: "#22d3ee" },
    { key: "money", label: "Money Trail", start: 84, end: 116, color: "#34d399" },
    { key: "close", label: "Case Closed", start: 116, end: TOTAL, color: "#8b8b9e" },
  ];

  events.sort((a, b) => a.t - b.t);

  return {
    firNo: fir.fir_no,
    title: fir.title,
    date: fir.incident_date,
    time: fir.incident_time === "-" ? "" : fir.incident_time,
    summary: fir.narrative.split(".").slice(0, 2).join(".") + ".",
    duration: TOTAL,
    scene,
    towers: towersOut,
    actors,
    keyframes,
    events,
    phases,
  };
}
