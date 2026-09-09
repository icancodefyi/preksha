// Phase 8.2: rule-based classifier. Deliberately not ML — the whole point
// (Principle 2/9) is that routing to a deterministic engine is itself
// auditable and testable, not a black box the LLM could quietly bypass.
export type Intent =
  | "ANALYTICAL_QUERY"
  | "FINANCIAL_QUERY"
  | "TEMPORAL_QUERY"
  | "ENTITY_LOOKUP"
  | "DOCUMENT_SUMMARY"
  | "GRAPH_QUERY"
  | "EVIDENCE_QUERY"
  | "HYBRID_QUERY";

const RULES: [RegExp, Intent][] = [
  [/\b(kingpin|central|most (?:important|influential)|betweenness|pagerank|centrality|community|cluster|disrupt)\b/i, "ANALYTICAL_QUERY"],
  [/\b(money|paid|transaction|transferred|account|rs\.?\d|amount|financ)/i, "FINANCIAL_QUERY"],
  [/\b(before|after|between .* and .* on|timeline|when did|what happened)\b/i, "TEMPORAL_QUERY"],
  [/\bsummar(y|ize)\b.*\bfir\b|\bfir\s*#?\d/i, "DOCUMENT_SUMMARY"],
  [/\bconnected to|neighbors? of|who (?:knows|called)|relationship between\b/i, "GRAPH_QUERY"],
  [/\bwhy\b.*\b(connect|link|relat)/i, "HYBRID_QUERY"],
  [/\bevidence|source|proof|cited?\b/i, "EVIDENCE_QUERY"],
];

export function classifyQuery(q: string): Intent {
  for (const [re, intent] of RULES) if (re.test(q)) return intent;
  return "ENTITY_LOOKUP"; // safest default: a bounded lookup, never a free-form graph dump
}

/** Phone-shaped substrings mentioned in the query, used to anchor GRAPH_QUERY lookups. */
export function extractQueryPhones(q: string): string[] {
  // .slice(-10), not a blind ^91 strip: a bare 10-digit number legitimately
  // starting with "91" (e.g. 9111100001) must not be mistaken for a
  // +91-prefixed 12-digit one and truncated.
  return [...new Set((q.match(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/g) ?? []).map((p) => p.replace(/[\s+-]/g, "").slice(-10)))];
}

/** FIR numbers mentioned in the query ("FIR 0666/2025", "FIR#23"). */
export function extractQueryFirNos(q: string): string[] {
  const m = [...q.matchAll(/\bfir\s*#?\s*([\d]{1,5}\s*\/\s*\d{4})/gi)];
  return m.map((x) => x[1].replace(/\s/g, ""));
}
