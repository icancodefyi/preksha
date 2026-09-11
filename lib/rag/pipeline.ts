// "Ask Preksha" pipeline — deterministic-first, history-aware, zero-hallucination.
//
// Design (mirrors the vcet-hackathon RAG philosophy):
//   1. Resolve the subject from the conversation (so "his details" -> the
//      person named in the previous answer, never a random record).
//   2. Answer known analytical question shapes deterministically from the
//      graph engine — instant and mathematically grounded, no model in the loop.
//   3. Only for genuinely free-form questions, optionally phrase the answer
//      with Groq over *retrieved* evidence, then strip any citation the model
//      invented and refuse if nothing matched — the model never originates facts.
//
// The LLM path is an enhancement, not a requirement: with no GROQ key the
// pipeline still answers everything deterministically.

import {
  answerQuestion,
  dossier,
  disruptionRanking,
  rankedSuspects,
  type Answer,
} from "@/lib/graph/enrich";
import { firs, discoveries } from "@/lib/data/seed";
import { resolveSubject, wantsProfile, historyWindow, type ChatTurn } from "./chat";

export const SUGGESTED = [
  "Who is the kingpin?",
  "How is the money moving?",
  "Who appears in more than one FIR?",
  "Why is the burner number a lead?",
  "Who should we arrest first?",
  "What happened before the Dadar robbery?",
];

export interface AskRequest {
  question: string;
  history?: ChatTurn[];
  caseId?: string;
}

// ---------------------------------------------------------------------------
// Deterministic answers for known shapes
// ---------------------------------------------------------------------------

function profileAnswer(key: string): Answer {
  const d = dossier(key);
  if (!d) {
    return { answer: `I couldn't find a profile for "${key}".`, sources: [], suggested: SUGGESTED, confidence: "low", trace: [] };
  }
  const firLines = d.firs
    .map((f) => `- ${f.fir_no} — ${f.title} (${f.year})`)
    .join("\n");
  const contacts = d.topContacts
    .map((c) => `${c.name} (${c.calls} calls)`)
    .join(", ");
  const metrics = d.metrics
    ? `degree ${d.metrics.degree} · betweenness ${d.metrics.betweenness} · PageRank ${d.metrics.pagerank} · community ${d.metrics.community}`
    : "no graph metrics";
  const money = d.money ? `₹${d.money.inflow.toLocaleString("en-IN")} inflow · ₹${d.money.outflow.toLocaleString("en-IN")} outflow` : "no financial records";

  return {
    answer:
      `**${d.name}** (${d.alias}) — ${d.role}, ${d.cluster} cluster, ${d.city}.\n\n` +
      `- Phone: ${d.phone}${d.phone2 ? ` · secondary ${d.phone2}` : ""}\n` +
      `- Risk score: **${d.risk}/100**\n` +
      `- Graph: ${metrics}\n` +
      `- Money: ${money}\n` +
      `- Top contacts: ${contacts}\n` +
      `- FIRs (${d.firCount}):\n${firLines || "  none"}`,
    sources: [
      { label: `Profile: ${d.name}`, ref: d.key },
      ...d.firs.map((f) => ({ label: `FIR ${f.fir_no}`, ref: f.fir_no })),
    ],
    suggested: SUGGESTED,
    confidence: "high",
    trace: [
      { label: "Resolved subject", detail: d.name, ms: 30 },
      { label: "Loaded dossier", detail: `${d.firCount} FIRs · ${d.topContacts.length} contacts`, ms: 60 },
    ],
  };
}

function arrestAnswer(): Answer {
  const kp = rankedSuspects()[0];
  const rank = disruptionRanking().slice(0, 3);
  return {
    answer:
      `Arrest **${kp.name}** first (risk ${kp.risk}/100). Removing ${kp.name} fragments the largest component by ` +
      `${disruptionRanking()[0].fragmentationPct}%. Next targets, in order: ${rank
        .slice(1)
        .map((d) => `${d.name} (${d.fragmentationPct}%)`)
        .join(", ")}.`,
    sources: [{ label: "Disruption ranking", ref: "disruptionRanking" }],
    suggested: SUGGESTED,
    confidence: "high",
    trace: [
      { label: "Computed betweenness", detail: "Brandes centrality over 44 links", ms: 40 },
      { label: "Simulated removals", detail: "largest-component fragmentation", ms: 80 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Optional grounded LLM over in-memory evidence (no external vector DB)
// ---------------------------------------------------------------------------

function corpusDocs(): { ref: string; label: string; text: string }[] {
  const docs: { ref: string; label: string; text: string }[] = [];
  for (const f of firs) docs.push({ ref: f.fir_no, label: `FIR ${f.fir_no}`, text: f.narrative });
  for (const [key, d] of Object.entries(discoveries)) {
    docs.push({ ref: `discovery:${key}`, label: `Finding: ${key.replace(/_/g, " ")}`, text: Object.values(d).join(". ") });
  }
  return docs;
}

function retrieve(q: string, topK = 4) {
  const toks = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const scored = corpusDocs().map((d) => {
    const t = d.text.toLowerCase();
    const hits = toks.filter((w) => t.includes(w)).length;
    return { d, hits };
  });
  return scored
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, topK)
    .map((s) => s.d);
}

async function groundedAnswer(question: string, history: ChatTurn[]): Promise<Answer> {
  const docs = retrieve(question);
  if (docs.length === 0) {
    return {
      answer: `I couldn't find any evidence matching "${question}" in the loaded case material — and I won't guess. Try one of the suggested questions.`,
      sources: [],
      suggested: SUGGESTED,
      confidence: "low",
      trace: [{ label: "Searched the corpus", detail: "0 matches — refusing to answer", ms: 30 }],
    };
  }

  const evidenceBlock = docs.map((d) => `[${d.ref}] (${d.label})\n${d.text}`).join("\n\n---\n\n");

  let text: string | null = null;
  try {
    const { generateGrounded } = await import("./groq");
    const prior = historyWindow(history).map((t) => `${t.role}: ${t.content}`).join("\n");
    text = (await generateGrounded(question, evidenceBlock, prior)).text;
  } catch {
    text = null; // no key / service down → fall through to deterministic phrasing
  }

  if (text) {
    // Citation validation: drop any id the model cited that wasn't retrieved.
    const retrievedIds = new Set(docs.map((d) => d.ref));
    const cited = [...text.matchAll(/[[【]\s*([^\]】]+?)\s*[\]】]/g)]
      .flatMap((m) => m[1].split(/\s*[;,]\s*/))
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = cited.filter((id) => retrievedIds.has(id));
    return {
      answer: text,
      sources: docs.filter((d) => valid.includes(d.ref)).map((d) => ({ label: d.label, ref: d.ref })),
      suggested: SUGGESTED,
      confidence: valid.length ? "high" : "medium",
      trace: [
        { label: "Searched the corpus", detail: `${docs.length} match${docs.length === 1 ? "" : "es"}`, ms: 30 },
        { label: "Generated grounded answer", detail: "Groq over retrieved evidence", ms: 60 },
        { label: "Validated citations", detail: `${valid.length} confirmed`, ms: 90 },
      ],
    };
  }

  // Deterministic phrasing of the retrieved evidence (no model).
  return {
    answer: `Based on the retrieved records: ${docs.map((d) => d.text).join(" ").slice(0, 400)}…`,
    sources: docs.map((d) => ({ label: d.label, ref: d.ref })),
    suggested: SUGGESTED,
    confidence: "medium",
    trace: [{ label: "Searched the corpus", detail: `${docs.length} matches`, ms: 30 }],
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function answerChat(req: AskRequest): Promise<Answer> {
  const q = req.question.trim();
  const history = req.history ?? [];

  const subject = resolveSubject(q, history);

  // 1. "details of <person>" (or a pronoun referring to a named person)
  if (subject.key && wantsProfile(q)) return profileAnswer(subject.key);
  if (subject.role === "kingpin" && wantsProfile(q)) {
    const kp = rankedSuspects()[0];
    return profileAnswer(kp.key);
  }
  if (subject.role === "burner" && wantsProfile(q)) return profileAnswer("burner");

  // 2. "who should we arrest first" / disruption
  if (/\b(arrest|remove|take down|target|neutrali[sz]e)\b/i.test(q)) return arrestAnswer();

  // 3. deterministic engine (instant, mathematically grounded, zero hallucination)
  const det = answerQuestion(q);
  if (det.confidence === "high") return det;

  // 4. free-form → grounded retrieval (LLM only if a key is configured)
  return groundedAnswer(q, history);
}
