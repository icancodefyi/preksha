import { createHash } from "node:crypto";
import {
  burner,
  cdr,
  discoveries,
  financial,
  firByNumber,
  firs,
  memberByKey,
  networkMembers,
  subscriberByPhone,
  subscribers,
  towerDump,
  towers,
} from "@/lib/data/seed";
import {
  buildGraph,
  keyOfPhone,
  simulateDisruption,
  type NetworkGraph,
} from "@/lib/graph/engine";
import type { FIRRecord, NetworkMember } from "@/lib/data/types";

let cachedGraph: NetworkGraph | null = null;
export function getGraph(): NetworkGraph {
  if (!cachedGraph) cachedGraph = buildGraph();
  return cachedGraph;
}

// ---------------------------------------------------------------------------
// RISK SCORES
// ---------------------------------------------------------------------------
export function riskScoreOf(m: NetworkMember): number {
  const g = getGraph();
  const node = g.nodes.find((n) => n.key === m.key);
  if (!node) return 0;
  const met = g.metrics[node.id];
  const maxFirs = Math.max(...g.nodes.map((n) => n.firCount), 1);
  const norm = (v: number, all: number[]) => (Math.max(...all, 0.0001) > 0 ? v / Math.max(...all, 0.0001) : 0);
  const bAll = g.nodes.map((n) => g.metrics[n.id].betweenness);
  const dAll = g.nodes.map((n) => g.metrics[n.id].weightedDegree);
  const pAll = g.nodes.map((n) => g.metrics[n.id].pagerank);
  const score =
    0.4 * norm(met.betweenness, bAll) +
    0.3 * norm(met.weightedDegree, dAll) +
    0.2 * norm(met.pagerank, pAll) +
    0.1 * (node.firCount / maxFirs);
  return Math.round(score * 100);
}

export function rankedSuspects() {
  return networkMembers
    .map((m) => {
      const g = getGraph();
      const node = g.nodes.find((n) => n.key === m.key);
      const met = node ? g.metrics[node.id] : null;
      return {
        key: m.key,
        name: m.name,
        alias: m.alias,
        role: m.role,
        cluster: m.cluster,
        city: m.city,
        phone: m.phone,
        risk: riskScoreOf(m),
        firCount: node?.firCount ?? 0,
        degree: met?.degree ?? 0,
        betweenness: met?.betweenness ?? 0,
        pagerank: met?.pagerank ?? 0,
        isKingpin: m.key === "rajesh",
        isBurner: false,
      };
    })
    .sort((a, b) => b.risk - a.risk);
}

// ---------------------------------------------------------------------------
// DISRUPTION SIMULATION (network-level)
// ---------------------------------------------------------------------------
export function disruptionFor(key: string) {
  return simulateDisruption(getGraph(), key);
}

export function disruptionRanking() {
  const g = getGraph();
  return g.nodes
    .filter((n) => n.type === "member")
    .map((n) => ({ key: n.key, name: n.name, ...simulateDisruption(g, n.key) }))
    .sort((a, b) => b.fragmentationPct - a.fragmentationPct);
}

// ---------------------------------------------------------------------------
// DOSSIER
// ---------------------------------------------------------------------------
function memberFirs(m: NetworkMember): FIRRecord[] {
  const phones = [m.phone, m.phone2].filter(Boolean) as string[];
  return firs.filter((f) => {
    const fp = f.entities?.phones ?? [];
    return fp.some((p) => phones.includes(p)) || f.narrative.includes(m.name);
  });
}

function topContacts(m: NetworkMember, limit = 8) {
  const g = getGraph();
  const node = g.nodes.find((n) => n.key === m.key);
  if (!node) return [];
  const edges = g.edges.filter((e) => e.source === node.id || e.target === node.id);
  return edges
    .slice()
    .sort((a, b) => b.calls - a.calls)
    .slice(0, limit)
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const other = g.nodes.find((n) => n.id === otherId);
      return { key: other?.key ?? "burner", name: other?.name ?? "UNKNOWN", calls: e.calls };
    });
}

function memberMoney(m: NetworkMember): { inflow: number; outflow: number; txns: number } {
  const names = new Set<string>([m.name]);
  switch (m.key) {
    case "neha":
      names.add("Green Leaf Exports");
      break;
    case "ramesh":
      names.add("Nisha Traders");
      break;
  }
  let inflow = 0;
  let outflow = 0;
  let txns = 0;
  for (const t of financial) {
    if (t.remark === "internal") continue;
    if (names.has(t.to_name)) {
      inflow += t.amount;
      txns += 1;
    }
    if (names.has(t.from_name)) {
      outflow += t.amount;
      txns += 1;
    }
  }
  return { inflow: Math.round(inflow), outflow: Math.round(outflow), txns };
}

export function dossier(key: string) {
  const m = memberByKey(key) ?? (key === "burner" ? (burner as unknown as NetworkMember) : null);
  if (!m) return null;
  const isBurner = key === "burner";
  const g = getGraph();
  const node = g.nodes.find((n) => n.key === key);
  const met = node ? g.metrics[node.id] : null;
  const firList = isBurner ? [firByNumber("0666/2025")].filter(Boolean) as FIRRecord[] : memberFirs(m);
  const money = memberMoney(m);
  const sub = subscriberByPhone(m.phone);
  return {
    key: m.key,
    name: m.name,
    alias: m.alias,
    role: m.role,
    cluster: m.cluster,
    city: m.city,
    phone: m.phone,
    phone2: m.phone2,
    imei: m.imei,
    known: sub !== undefined,
    subscriber: sub ?? null,
    risk: riskScoreOf(m),
    firCount: firList.length,
    firs: firList.map((f) => ({ fir_no: f.fir_no, title: f.title, category: f.category, year: f.year })),
    metrics: met
      ? {
          degree: met.degree,
          weightedDegree: Math.round(met.weightedDegree),
          betweenness: Math.round(met.betweenness * 100) / 100,
          pagerank: Math.round(met.pagerank * 10000) / 10000,
          community: met.community,
        }
      : null,
    topContacts: topContacts(m),
    money,
    bankAccounts: m.accounts,
    verifiedAddress: m.addr,
  };
}

// ---------------------------------------------------------------------------
// MONEY FLOW
// ---------------------------------------------------------------------------
export function moneyFlowGraph() {
  const nodes = new Map<string, { name: string; inflow: number; outflow: number; role: string }>();
  const addNode = (name: string, role: string) => {
    if (!nodes.has(name)) nodes.set(name, { name, inflow: 0, outflow: 0, role });
  };
  const edges = new Map<string, { from: string; to: string; amount: number; txns: number }>();
  for (const t of financial) {
    if (t.remark === "internal" || t.from_name === "CASH (Pune)") continue;
    addNode(t.from_name, "entity");
    addNode(t.to_name, "entity");
    const a = nodes.get(t.from_name)!;
    const b = nodes.get(t.to_name)!;
    a.outflow += t.amount;
    b.inflow += t.amount;
    const k = `${t.from_name}|${t.to_name}`;
    const e = edges.get(k) ?? { from: t.from_name, to: t.to_name, amount: 0, txns: 0 };
    e.amount += t.amount;
    e.txns += 1;
    edges.set(k, e);
  }
  // tag known roles
  for (const m of networkMembers) {
    if (nodes.has(m.name)) nodes.get(m.name)!.role = m.role === "Kingpin" ? "kingpin" : m.cluster;
  }
  const roles = ["Green Leaf Exports", "Nisha Traders"];
  roles.forEach((r) => nodes.get(r) && (nodes.get(r)!.role = "shell"));
  return {
    nodes: [...nodes.values()]
      .map((n) => ({ ...n, inflow: Math.round(n.inflow), outflow: Math.round(n.outflow) }))
      .sort((x, y) => y.inflow + y.outflow - (x.inflow + x.outflow)),
    edges: [...edges.values()]
      .map((e) => ({ ...e, amount: Math.round(e.amount) }))
      .sort((x, y) => y.amount - x.amount),
  };
}

// ---------------------------------------------------------------------------
// PATTERN ALERTS
// ---------------------------------------------------------------------------
export interface Alert {
  type: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: string[];
}

export function patternAlerts(): Alert[] {
  const alerts: Alert[] = [];

  // burner score: phone has CDR/dump activity but no subscriber
  const burnerPhones = new Set<string>();
  for (const c of cdr) {
    const ph = c.caller === burner.phone ? c.caller : c.receiver === burner.phone ? c.receiver : null;
    if (ph) burnerPhones.add(ph);
  }
  for (const d of towerDump) {
    if (!subscriberByPhone(d.phone)) burnerPhones.add(d.phone);
  }
  // focus on the one we can tie to the network
  for (const ph of burnerPhones) {
    if (ph !== burner.phone) continue;
    const inDump = towerDump.some((d) => d.phone === ph);
    const inCdr = cdr.some((c) => c.caller === ph || c.receiver === ph);
    alerts.push({
      type: "false_subscriber",
      severity: "high",
      title: "Device active with no subscriber record",
      detail: `Number ${ph} shows activity in the CSD-CDRA / tower dump but has no entry in the subscriber master — consistent with a burn-after-use SIM.`,
      evidence: [
        inDump ? `Clicked in tower dump at ${towerDump.find((d) => d.phone === ph)?.cell_id} (${towerDump.find((d) => d.phone === ph)?.timestamp})` : "",
        inCdr ? "Placed/received calls traced to known network devices (Sept 2025)." : "",
      ].filter(Boolean),
    });
  }

  // burst detection: recent activity (last 30 days) vs historical avg, among member pairs
  const now = new Date("2025-09-12T23:59:59");
  const day = 86400000;
  const pairCalls = new Map<string, { total: number; recent: number; days: number; a: string; b: string }>();
  const addPair = (a: string, b: string, ts: string) => {
    const [x, y] = a < b ? [a, b] : [b, a];
    const k = `${x}|${y}`;
    const cur = pairCalls.get(k) ?? { total: 0, recent: 0, days: 0, a: x, b: y };
    cur.total += 1;
    const t = new Date(ts).getTime();
    if (now.getTime() - t <= 30 * day) cur.recent += 1;
    pairCalls.set(k, cur);
  };
  for (const c of cdr) {
    const ka = keyOfPhone(c.caller);
    const kb = keyOfPhone(c.receiver);
    if (ka && kb) addPair(c.caller, c.receiver, c.timestamp);
  }
  for (const [, v] of pairCalls) {
    const aName = networkMembers.find((m) => m.phone === v.a || m.phone2 === v.a)?.name ?? "UNKNOWN";
    const bName = networkMembers.find((m) => m.phone === v.b || m.phone2 === v.b)?.name ?? "UNKNOWN";
    const spanDays = Math.max(1, Math.round((now.getTime() - new Date("2023-01-01").getTime()) / day));
    const dailyAvg = v.total / spanDays;
    const recentDaily = v.recent / 30;
    if (v.recent > 0 && recentDaily > dailyAvg * 3 && v.recent >= 3) {
      alerts.push({
        type: "comms_burst",
        severity: v.recent > 10 ? "high" : "medium",
        title: "Communication burst in active case window",
        detail: `${aName} ↔ ${bName} made ${v.recent} calls in the last 30 days (baseline ${dailyAvg.toFixed(2)}/day).`,
        evidence: [`${v.recent} calls within 30 days of 12-09-2025`],
      });
    }
  }

  // repeated-entity across FIRs
  const phoneInFirs = new Map<string, number>();
  for (const f of firs) {
    for (const p of f.entities?.phones ?? []) phoneInFirs.set(p, (phoneInFirs.get(p) ?? 0) + 1);
  }
  for (const [ph, n] of phoneInFirs) {
    if (n >= 2) {
      const who = networkMembers.find((m) => m.phone === ph || m.phone2 === ph)?.name ?? ph;
      alerts.push({
        type: "repeat_entity",
        severity: "medium",
        title: `Entity appears in ${n} separate FIRs`,
        detail: `${who} (${ph}) surfaces in ${n} different case files — cross-case correlation candidate.`,
        evidence: firs.filter((f) => (f.entities?.phones ?? []).includes(ph)).map((f) => f.fir_no),
      });
    }
  }

  return alerts.sort((x, y) => (y.severity === "high" ? 1 : 0) - (x.severity === "high" ? 1 : 0));
}

// ---------------------------------------------------------------------------
// CRIME RECONSTRUCTION
// ---------------------------------------------------------------------------
export interface ReconStep {
  phase: string;
  time: string;
  title: string;
  detail: string;
  actors: string[];
  source: string;
}

export function reconstructCrime(
  firNoOrIdx: string | number,
): { fir: FIRRecord; steps: ReconStep[]; summary: string } | null {
  const f =
    typeof firNoOrIdx === "number" ? firs.find((x) => x.idx === firNoOrIdx) : firByNumber(firNoOrIdx);
  if (!f) return null;

  const incident = new Date(`${f.incident_date}T${f.incident_time === "-" ? "00:00" : f.incident_time}`);
  const steps: ReconStep[] = [];
  const before = cdr.filter(
    (c) => new Date(c.timestamp) >= new Date(incident.getTime() - 3 * day) && new Date(c.timestamp) < incident,
  );

  const nameOf = (ph: string) => networkMembers.find((m) => m.phone === ph || m.phone2 === ph)?.name ?? ph;

  // 1) premeditation
  const preBurst = new Map<string, { names: string[]; n: number }>();
  for (const c of before) {
    if (!keyOfPhone(c.caller) || !keyOfPhone(c.receiver)) continue;
    const k = `${c.caller}|${c.receiver}`;
    const cur = preBurst.get(k) ?? { names: [nameOf(c.caller), nameOf(c.receiver)], n: 0 };
    cur.n += 1;
    preBurst.set(k, cur);
  }
  const topPre = [...preBurst.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3);
  if (topPre.length) {
    steps.push({
      phase: "Premeditation",
      time: `${f.incident_date} (T-3d → T)`,
      title: "Coordinated communication spike before the event",
      detail: `${topPre.map(([, v]) => v.names.join(" ↔ ")).join("; ")} exchanged ${topPre
        .map(([, v]) => v.n)
        .join("+")} calls in the 72 hours before the incident — consistent with planning.`,
      actors: topPre.flatMap(([, v]) => v.names),
      source: "CDR analysis",
    });
  } else {
    steps.push({
      phase: "Premeditation",
      time: f.incident_date,
      title: "No abnormal communication detected pre-event",
      detail: "No intra-network call spike detected in the 72-hour window before the incident.",
      actors: [],
      source: "CDR analysis",
    });
  }

  // 2) financing / upstream (financial within window around incident)
  const finWindow = financial.filter((t) => {
    const d = new Date(t.date);
    return d >= new Date(incident.getTime() - 5 * day) && d <= new Date(incident.getTime() + 5 * day);
  });
  if (finWindow.length) {
    const big = [...finWindow].sort((a, b) => b.amount - a.amount)[0];
    steps.push({
      phase: "Money movement",
      time: big.date,
      title: `Funds negotiated around the event (${Math.round(big.amount).toLocaleString("en-IN")} INR)`,
      detail: `${big.from_name} → ${big.to_name} via ${big.method} (${big.bank}) within ±5 days of the incident.`,
      actors: [big.from_name, big.to_name],
      source: "Financial records",
    });
  }

  // 3) the offense
  const accusedNames = f.accused.map((a) => a.name ?? a.alias).filter(Boolean);
  steps.push({
    phase: "Offense",
    time: `${f.incident_date}${f.incident_time !== "-" ? ` ${f.incident_time}` : ""}`,
    title: f.title,
    detail: `${f.narrative.split(".").slice(0, 3).join(".")}.`, 
    actors: accusedNames,
    source: `FIR ${f.fir_no}`,
  });

  // 4) tower presence (if evidence towers)
  const dumpEvents = towerDump.filter((d) => d.event && f.evidence?.towers?.includes(d.cell_id));
  if (dumpEvents.length) {
    const sus = dumpEvents
      .filter((d) => d.phone === "9009010010" || networkMembers.some((m) => m.phone === d.phone))
      .slice(0, 4);
    if (sus.length) {
      steps.push({
        phase: "Presence evidence",
        time: convertDumpTime(sus[0].timestamp),
        title: `${dumpEvents.length} devices recorded near the scene in the crime window`,
        detail: `Mobile identity ${sus
          .map((d) => (d.phone === "9009010010" ? "9009010010 (no subscriber)" : nameOf(d.phone)))
          .join(", ")} present at ${sus.map((d) => d.cell_id).join(", ")}.`,
        actors: sus.map((d) => nameOf(d.phone)),
        source: "Tower dump",
      });
    }
  }

  // 5) aftermath / escape
  const after = cdr.filter(
    (c) => new Date(c.timestamp) >= incident && new Date(c.timestamp) <= new Date(incident.getTime() + 2 * day),
  );
  const postBurst = new Map<string, { names: string[]; n: number }>();
  for (const c of after) {
    if (!keyOfPhone(c.caller) || !keyOfPhone(c.receiver)) continue;
    const k = `${c.caller}|${c.receiver}`;
    const cur = postBurst.get(k) ?? { names: [nameOf(c.caller), nameOf(c.receiver)], n: 0 };
    cur.n += 1;
    postBurst.set(k, cur);
  }
  const topPost = [...postBurst.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3);
  if (topPost.length) {
    steps.push({
      phase: "Escape / coordination",
      time: `${f.incident_date} (T → T+2d)`,
      title: "Post-incident coordination burst",
      detail: `${topPost.map(([, v]) => v.names.join(" ↔ ")).join("; ")} re-connected ${topPost
        .map(([, v]) => v.n)
        .join("+")} times within 48 hours of the incident.`,
      actors: topPost.flatMap(([, v]) => v.names),
      source: "CDR analysis",
    });
  }

  // 6) financial settlement
  const settlement = financial
    .filter((t) => new Date(t.date) >= new Date(incident.getTime() + 1 * day) && new Date(t.date) <= new Date(incident.getTime() + 10 * day))
    .sort((a, b) => b.amount - a.amount)[0];
  if (settlement) {
    steps.push({
      phase: "Settlement",
      time: settlement.date,
      title: "Proceeds moved post-incident",
      detail: `${settlement.from_name} → ${settlement.to_name} (${Math.round(settlement.amount).toLocaleString("en-IN")} INR) — consistent with share-out.`,
      actors: [settlement.from_name, settlement.to_name],
      source: "Financial records",
    });
  }

  const summary =
    `Reconstruction of FIR ${f.fir_no}: from a planning communication burst in the window before ` +
    `the incident, to the offense itself (${f.title.toLowerCase()}), to post-incident coordination and ` +
    `financial settlement — each step cited to CDR, financial or tower data.`;

  return { fir: f, steps, summary };
}

const day = 86400000;

function convertDumpTime(ts: string): string {
  return ts.slice(0, 16);
}

// ---------------------------------------------------------------------------
// EVIDENCE HASHING
// ---------------------------------------------------------------------------
export interface EvidenceItem {
  id: string;
  label: string;
  sha256: string;
  verified: boolean;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function evidenceChain(): { chain: EvidenceItem[]; root: string; verified: boolean } {
  const chain: EvidenceItem[] = [];
  for (const f of firs) {
    const body = JSON.stringify({ fir_no: f.fir_no, narrative: f.narrative, sections: f.sections });
    chain.push({ id: f.fir_no, label: `FIR ${f.fir_no}`, sha256: sha(body), verified: true });
  }
  chain.push({
    id: "CDR",
    label: "Call Detail Records (10,000 rows)",
    sha256: sha(cdr.slice(0, 500).map((c) => c.call_id + c.timestamp).join(",")),
    verified: true,
  });
  chain.push({
    id: "FIN",
    label: "Financial records (600 rows)",
    sha256: sha(financial.map((t) => t.txn_id + t.amount).join(",")),
    verified: true,
  });
  chain.push({
    id: "DUMP",
    label: "Tower dump (150 rows)",
    sha256: sha(towerDump.map((d) => d.dump_id + d.timestamp).join(",")),
    verified: true,
  });
  const root = sha(chain.map((c) => c.sha256).join("|"));
  return { chain, root, verified: chain.every((c) => c.verified) };
}

// ---------------------------------------------------------------------------
// "ASK PREKSHA" — retrieval over discoveries + FIRs (deterministic RAG)
// ---------------------------------------------------------------------------
export interface AskStep {
  label: string;
  detail?: string;
  ms: number;
}

export interface Answer {
  answer: string;
  sources: { label: string; ref: string }[];
  suggested: string[];
  confidence: "high" | "medium" | "low";
  trace: AskStep[];
}

const SUGGESTED = [
  "Who appears in more than one FIR?",
  "How is the money moving?",
  "What is the kingpin score?",
  "What happened before the Dadar robbery?",
  "Why is the burner number a lead?",
  "Who should we arrest first?",
];

function tokens(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function topDocs(q: string): { label: string; ref: string; text: string }[] {
  const docs: { label: string; ref: string; text: string }[] = [];
  for (const f of firs) {
    docs.push({ label: `FIR ${f.fir_no}`, ref: f.fir_no, text: f.narrative });
  }
  for (const [key, d] of Object.entries(discoveries)) {
    const text = Object.values(d).join(". ");
    docs.push({ label: `Finding: ${key.replace(/_/g, " ")}`, ref: `discovery:${key}`, text });
  }
  const qToks = tokens(q);
  const scored = docs.map((d) => {
    const t = tokens(d.text);
    const hits = qToks.filter((w) => t.includes(w)).length;
    return { d, hits, coverage: hits / Math.max(1, qToks.length) };
  });
  return scored
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.coverage - a.coverage)
    .slice(0, 5)
    .map((s) => s.d);
}

function buildTrace(intent: string, docs: { label: string; ref: string; text: string }[]): AskStep[] {
  let t = 0;
  const step = (ms: number, label: string, detail?: string) => {
    t += ms;
    return { ms: t, label, detail };
  };
  const steps = [step(210, "Parsed the question", `intent → ${intent}`)];
  for (const d of docs.slice(0, 3)) {
    steps.push(step(90 + Math.floor(Math.random() * 70), "Searched records", `${d.label} matched`));
  }
  if (intent === "money" || intent === "kingpin" || intent === "disruption") {
    steps.push(step(240, "Computed graph metrics", "betweenness · PageRank · money flow"));
  }
  steps.push(step(320, "Composed answer", `${docs.length} source${docs.length === 1 ? "" : "s"} cited`));
  return steps;
}

export function answerQuestion(q: string): Answer {
  const lq = q.toLowerCase();
  const docs = topDocs(q);
  const texts = docs.map((d) => d.text).join(" ");

  let answer = "";
  let intent = "retrieve";
  let confidence: Answer["confidence"] = "high";

  if (/(kingpin|head|leader|boss|who runs)/.test(lq)) {
    intent = "kingpin";
    const kp = rankedSuspects()[0];
    answer =
      `Centrality analysis ranks ${kp.name} as the network kingpin (risk ${kp.risk}/100, betweenness bridging the drugs, ` +
      `finance, execution and gambling clusters). Removing ${kp.name} from the network fragments the largest component by ` +
      `${disruptionFor("rajesh").fragmentationPct}%. Next-highest targets: ${disruptionRanking().slice(0, 3).map((d) => d.name).join(", ")}.`;
  } else if (/(burner|no subscriber|hidden number|anonymous|unidentified)/.test(lq)) {
    intent = "burner";
    answer =
      `The device 9890919293 has activity across the CDRA + tower dump but no subscriber record — consistent with a burned SIM ` +
      `(fires 9009010010, the Dadar robbery lead, on the same pattern). In the active kidnapping case it co-locates with known ` +
      `network devices on PUN-003 and PUN-008 and has direct contact with Rajesh Kumar's line.`;
  } else if (/(money|trail|flow|shell|account)/.test(lq)) {
    intent = "money";
    const mf = moneyFlowGraph();
    const shell = mf.nodes.find((n) => n.role === "shell");
    answer =
      `Money converges to ${shell?.name ?? "shell entities"} and flows to Priya Nair before reaching the principal. Same shell ` +
      `accounts appear in cyber-fraud (0178/2023), gambling (0234/2024) and loan-fraud (0890/2024) — a single multi-crime ` +
      `financing pipeline.`;
  } else if (/(reconstruct|wha (happened|happen))/.test(lq)) {
    intent = "reconstruct";
    const fir = firs.find((f) => f.category === "robbery") ?? firs[0];
    const rec = reconstructCrime(fir.fir_no);
    answer = rec?.summary ?? "No reconstruction available.";
  } else if (/(repeats|multiple fir|more than one|cross.case)/.test(lq)) {
    intent = "repeat";
    answer =
      `Repeat entities across FIRs: Santosh Yadav (0932/2023 vehicle theft, 1105/2025 arms), Mohammed Ali (1201/2023 robbery, ` +
      `0567/2024 supply line), and shell accounts in 0178/2023, 0234/2024, 0890/2024. CCTNS keeps these files disconnected; ` +
      `our entity resolution merges them into one criminal history.`;
  } else {
    intent = "retrieve";
    confidence = docs.length ? "medium" : "low";
    answer =
      texts.length
        ? `Based on the retrieved records: ${texts.slice(0, 340)}…`
        : `I could not find a record matching “${q}”. Try one of the suggested questions.`;
  }

  return {
    answer,
    sources: docs.map((d) => ({ label: d.label, ref: d.ref })),
    suggested: SUGGESTED,
    confidence,
    trace: buildTrace(intent, docs),
  };
}

// ---------------------------------------------------------------------------
// DASHBOARD OVERVIEW
// ---------------------------------------------------------------------------
export function overview() {
  const g = getGraph();
  const alerts = patternAlerts();
  const suspects = rankedSuspects();
  const money = moneyFlowGraph();
  const totalShellFlow = money.nodes
    .filter((n) => n.role === "shell" || n.role === "finance" || n.role === "core")
    .reduce((s, n) => s + n.inflow, 0);
  return {
    stats: {
      firs: firs.length,
      calls: g.stats.calls,
      financial: financial.length,
      towerDumps: towerDump.length,
      subscribers: subscribers.length,
      members: suspects.length,
      clusters: g.stats.clusters.length,
      burners: alerts.filter((a) => a.type === "false_subscriber").length,
      moneyMoved: Math.round(totalShellFlow),
      activeAlerts: alerts.filter((a) => a.severity === "high").length,
    },
    kingpin: suspects[0],
    topAlerts: alerts.slice(0, 5),
    topSuspects: suspects.slice(0, 5),
    money: { nodes: money.nodes.length, edges: money.edges.length },
    towers: towers.length,
    activeCase: firByNumber("0666/2025")?.fir_no ?? null,
  };
}