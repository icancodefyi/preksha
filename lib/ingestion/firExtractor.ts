// Local, zero-external-dependency FIR entity extraction (Phase 12.5 §1,
// tier (a): "rules/regex + gazetteer only... fine as a fallback"). No API
// key, no model download — this is the honest floor, not a pretend NER
// model. A fine-tuned InLegalBERT/spaCy pass is a production upgrade behind
// the same output shape (see docs/ARCHITECTURE.md M1), not a rewrite here.

export interface ExtractedFirEntities {
  firNo: string | null;
  incidentDate: string | null;
  complainant: string | null;
  accused: string[];
  persons: string[]; // union of complainant/accused/witness-labeled names
  phones: string[];
  locations: string[];
  vehicles: string[];
  sections: string[]; // IPC/CrPC sections
  confidence: number; // heuristic-blended, always < 1.0 — never claim certainty
}

const PHONE_RE = /(?:\+?91[-\s]?)?[6-9]\d{9}\b/g;
// Two orderings both appear in real FIR text: "Section 392 IPC" (keyword
// first) and "392 IPC" (act name first, no "section" keyword at all).
const SECTION_RE_PRE = /\b(?:(?:IPC|CrPC|NDPS)\s*)?(?:section|sec\.?|u\/s|s\.)\s*(\d{1,3}[A-Za-z]?)\b/gi;
const SECTION_RE_POST = /\b(\d{1,3}[A-Za-z]?)\s*(?:IPC|CrPC|NDPS)\b/gi;
const FIR_NO_RE = /\bFIR\s*(?:No\.?|Number)?\s*[:#-]?\s*([\d]{1,5}\s*\/\s*\d{4})/i;
const VEHICLE_RE = /\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{3,4}\b/g;
const DATE_RE = /\b(\d{1,2}[-/](?:\d{1,2}|[A-Za-z]{3,})[-/]\d{2,4})\b/;

function labeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n]{2,120})`, "i");
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

function labeledList(text: string, labels: string[]): string[] {
  const raw = labeled(text, labels);
  if (!raw) return [];
  return raw
    .split(/[,;]| and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);
}

// Fallback for free-form narrative with no labeled fields: consecutive
// Title-Case words, deliberately treated as LOW confidence — this is a
// heuristic, not identification, and is never auto-merged (Phase 2.2).
function capitalizedPhrases(text: string, max = 15): string[] {
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) ?? [];
  const stop = new Set(["The", "This", "That", "FIR", "Police", "Station", "District", "State"]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const first = m.split(" ")[0];
    if (stop.has(first) || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

export function extractFirEntities(text: string): ExtractedFirEntities {
  const firNoMatch = text.match(FIR_NO_RE);
  const dateMatch = text.match(DATE_RE);

  const complainant = labeled(text, ["complainant", "informant"]);
  const accused = labeledList(text, ["accused", "suspect(?:s)?"]);
  const witnesses = labeledList(text, ["witness(?:es)?"]);
  const location = labeled(text, ["place of occurrence", "location", "address"]);

  // .slice(-10), not a blind ^91 strip — see lib/rag/router.ts for why.
  const phones = [...new Set((text.match(PHONE_RE) ?? []).map((p) => p.replace(/[\s+-]/g, "").slice(-10)))];
  const sections = [
    ...new Set([...text.matchAll(SECTION_RE_PRE), ...text.matchAll(SECTION_RE_POST)].map((m) => m[1])),
  ];
  const vehicles = [...new Set(text.match(VEHICLE_RE) ?? [])];

  const persons = [...new Set([complainant, ...accused, ...witnesses].filter((x): x is string => !!x))];
  const hasLabeledFields = persons.length > 0;
  const fallbackNames = hasLabeledFields ? [] : capitalizedPhrases(text);

  return {
    firNo: firNoMatch ? firNoMatch[1].replace(/\s/g, "") : null,
    incidentDate: dateMatch ? dateMatch[1] : null,
    complainant,
    accused,
    persons: hasLabeledFields ? persons : fallbackNames,
    phones,
    locations: location ? [location] : [],
    vehicles,
    sections,
    // Labeled-field extraction is meaningfully more reliable than the
    // capitalized-phrase fallback — the confidence score reflects that,
    // not a measured metric (Phase 12.5 §1: report real numbers once
    // there's a labeled evaluation set; until then this is a stated,
    // conservative heuristic, not a claim of measured accuracy).
    confidence: hasLabeledFields ? 0.65 : 0.35,
  };
}
