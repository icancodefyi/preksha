import { prisma } from "@/lib/db/client";
import { buildCaseGraph } from "@/lib/graph/caseGraph";
import { classifyQuery, extractQueryFirNos, extractQueryPhones, type Intent } from "@/lib/rag/router";
import type { Citation } from "@/lib/rag/citation";

export interface RagAnswer {
  intent: Intent;
  answer: string;
  citations: Citation[];
  confidence: "high" | "medium" | "low";
}

/**
 * Deterministic-floor RAG (Phase 8.5): every branch here is a real query
 * against ingested case data — nothing hardcoded to a demo dataset, unlike a
 * canned-answer mock. No LLM call is made; this IS the answer for MVP. A
 * generative explanation layer (Phase 8.1 "Guarded LLM") can wrap this
 * later — see lib/rag/llm.ts stub — but every fact and citation below must
 * still originate here, never from the model (Principle 2/6).
 */
export async function answerQuery(caseId: string, query: string): Promise<RagAnswer> {
  const intent = classifyQuery(query);

  switch (intent) {
    case "ANALYTICAL_QUERY":
      return analyticalAnswer(caseId, query);
    case "FINANCIAL_QUERY":
      return financialAnswer(caseId);
    case "DOCUMENT_SUMMARY":
      return documentSummaryAnswer(caseId, query);
    case "GRAPH_QUERY":
    case "HYBRID_QUERY":
    case "EVIDENCE_QUERY":
      return graphAnswer(caseId, query, intent);
    case "TEMPORAL_QUERY":
      return temporalAnswer(caseId);
    case "ENTITY_LOOKUP":
    default:
      return entityLookupAnswer(caseId, query);
  }
}

async function analyticalAnswer(caseId: string, query: string): Promise<RagAnswer> {
  const metric = /community|cluster/i.test(query) ? "community" : /disrupt|arrest|remove/i.test(query) ? "disruption" : "betweenness";
  const run = await prisma.analyticalRun.findFirst({ where: { caseId, metric }, orderBy: { computedAt: "desc" } });
  if (!run) {
    return {
      intent: "ANALYTICAL_QUERY",
      answer: `No ${metric} analysis has been computed for this case yet. Run POST /api/cases/${caseId}/analytics first.`,
      citations: [],
      confidence: "low",
    };
  }
  const summary = JSON.stringify(run.resultSummary).slice(0, 500);
  return {
    intent: "ANALYTICAL_QUERY",
    answer: `Latest ${metric} analysis (computed ${run.computedAt.toISOString()}): ${summary}. This is a structural indicator, not a determination of guilt or leadership — see docs/ARCHITECTURE.md Phase 2.3.`,
    citations: [{ sourceType: "analytical_run", caseId, recordId: run.id, label: `${metric} run`, confidence: 1 }],
    confidence: "high",
  };
}

async function financialAnswer(caseId: string): Promise<RagAnswer> {
  const txns = await prisma.transaction.findMany({ where: { caseId } });
  if (txns.length === 0) {
    return { intent: "FINANCIAL_QUERY", answer: "No financial records ingested for this case.", citations: [], confidence: "low" };
  }
  const total = txns.reduce((s, t) => s + t.amount, 0);
  const pairs = new Map<string, number>();
  for (const t of txns) {
    const k = `${t.fromName} -> ${t.toName}`;
    pairs.set(k, (pairs.get(k) ?? 0) + t.amount);
  }
  const top = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const evidence = await prisma.evidence.findMany({ where: { caseId, recordType: "financial_batch" } });
  return {
    intent: "FINANCIAL_QUERY",
    answer: `${txns.length} transaction(s) totaling ${Math.round(total).toLocaleString("en-IN")}. Largest flows: ${top
      .map(([k, v]) => `${k} (${Math.round(v).toLocaleString("en-IN")})`)
      .join("; ")}.`,
    citations: evidence.map((e) => ({ sourceType: "evidence", caseId, recordId: e.id, label: "financial batch import", confidence: e.confidence ?? 1 })),
    confidence: "high",
  };
}

async function documentSummaryAnswer(caseId: string, query: string): Promise<RagAnswer> {
  const firNos = extractQueryFirNos(query);
  const fir = firNos.length
    ? await prisma.fir.findFirst({ where: { caseId, firNo: firNos[0] } })
    : await prisma.fir.findFirst({ where: { caseId }, orderBy: { createdAt: "desc" } });
  if (!fir) {
    return { intent: "DOCUMENT_SUMMARY", answer: "No matching FIR ingested for this case.", citations: [], confidence: "low" };
  }
  return {
    intent: "DOCUMENT_SUMMARY",
    answer: `FIR ${fir.firNo ?? fir.id}: ${fir.narrative.slice(0, 400)}${fir.narrative.length > 400 ? "…" : ""}`,
    citations: [{ sourceType: "fir", caseId, recordId: fir.id, label: `FIR ${fir.firNo ?? fir.id}`, confidence: 1 }],
    confidence: "high",
  };
}

async function graphAnswer(caseId: string, query: string, intent: Intent): Promise<RagAnswer> {
  const phones = extractQueryPhones(query);
  if (phones.length === 0) {
    return { intent, answer: "Mention a phone number to look up its network neighborhood.", citations: [], confidence: "low" };
  }
  const graph = await buildCaseGraph(caseId);
  const nodeId = `phone:${phones[0]}`;
  const neighbors = graph.edges
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10);
  if (neighbors.length === 0) {
    return { intent, answer: `No communication links found for ${phones[0]} in this case's ingested data.`, citations: [], confidence: "low" };
  }
  const evidence = await prisma.evidence.findMany({ where: { caseId, recordType: "cdr_batch" } });
  const lines = neighbors.map((e) => {
    const other = e.source === nodeId ? e.target : e.source;
    return `${other.replace("phone:", "")} (${e.calls} calls, ${e.first}→${e.last})`;
  });
  return {
    intent,
    answer: `${phones[0]} has ${neighbors.length} direct contact(s) in this case: ${lines.join("; ")}.`,
    citations: evidence.map((e) => ({ sourceType: "evidence", caseId, recordId: e.id, label: "CDR import", confidence: e.confidence ?? 1 })),
    confidence: "high",
  };
}

async function temporalAnswer(caseId: string): Promise<RagAnswer> {
  const events = await prisma.communicationEvent.findMany({ where: { caseId }, orderBy: { timestamp: "asc" }, take: 500 });
  if (events.length === 0) {
    return { intent: "TEMPORAL_QUERY", answer: "No communication events ingested for this case.", citations: [], confidence: "low" };
  }
  const first = events[0].timestamp.toISOString();
  const last = events[events.length - 1].timestamp.toISOString();
  return {
    intent: "TEMPORAL_QUERY",
    answer: `${events.length} communication event(s) span ${first} to ${last}. See GET /api/cases/${caseId}/timeline for the bucketed series.`,
    citations: [],
    confidence: "medium",
  };
}

async function entityLookupAnswer(caseId: string, query: string): Promise<RagAnswer> {
  const q = query.toLowerCase().trim();
  const phones = extractQueryPhones(query);
  const term = phones[0] ?? q;
  const matches = await prisma.communicationEvent.findMany({
    where: { caseId, OR: [{ caller: { contains: term } }, { receiver: { contains: term } }] },
    take: 10,
  });
  if (matches.length === 0) {
    return { intent: "ENTITY_LOOKUP", answer: `No entity matching "${query}" found in this case's ingested data.`, citations: [], confidence: "low" };
  }
  return {
    intent: "ENTITY_LOOKUP",
    answer: `Found ${matches.length} communication record(s) matching "${term}". Use GET /api/cases/${caseId}/search?q= for the full list.`,
    citations: [],
    confidence: "medium",
  };
}
