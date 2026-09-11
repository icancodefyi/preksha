// Corpus: chunk the seed data (FIRs, members, discoveries, financials) into
// retrieval passages, each tagged with the FIR numbers it belongs to so case
// chat can be scoped tightly (no cross-case leakage).
import { firs, networkMembers, burner, discoveries, financial } from "@/lib/data/seed";
import type { NetworkMember } from "@/lib/data/types";
import type { SourceChunk } from "./types";

const FIR_NO_RE = /\b(\d{3,5}\/\d{4})\b/g;

function firNosIn(text: string): string[] {
  return [...new Set([...text.matchAll(FIR_NO_RE)].map((m) => m[1]))];
}

function firsForMember(m: NetworkMember): string[] {
  const out: string[] = [];
  const name = m.name.toLowerCase();
  for (const f of firs) {
    const e = f.entities ?? {};
    const hay = [
      f.narrative,
      (e.persons ?? []).join(" "),
      (e.phones ?? []).join(" "),
      (f.accused ?? []).map((a) => a.name ?? a.alias).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const phoneHit =
      (m.phone && (e.phones ?? []).includes(m.phone)) || (m.phone2 && (e.phones ?? []).includes(m.phone2));
    if (hay.includes(name) || phoneHit) out.push(f.fir_no);
  }
  return out;
}

export function buildCorpus(): SourceChunk[] {
  const chunks: SourceChunk[] = [];

  // 1. FIRs — the richest, most-cited evidence.
  for (const f of firs) {
    const e = f.entities ?? {};
    const text = [
      `FIR ${f.fir_no} — ${f.title}`,
      `Category: ${f.category}. Sections: ${(f.sections ?? []).join(", ") || "none"}.`,
      `Police station: ${f.police_station}, ${f.district}, ${f.state}. Incident: ${f.incident_date}${f.incident_time !== "-" ? " " + f.incident_time : ""}. Registered: ${f.registered_date}.`,
      `Narrative: ${f.narrative}`,
      `Complainant: ${f.complainant?.name ?? "unknown"}${f.complainant?.relation ? ` (${f.complainant.relation})` : ""}.`,
      `Accused: ${(f.accused ?? []).map((a) => a.name ?? a.alias).filter(Boolean).join(", ") || "none identified"}.`,
      `Entities — persons: ${(e.persons ?? []).join(", ") || "none"}; phones: ${(e.phones ?? []).join(", ") || "none"}; places: ${(e.places ?? []).join(", ") || "none"}; accounts: ${(e.accounts ?? []).join(", ") || "none"}; vehicles: ${((e as { vehicles?: string[] }).vehicles ?? []).join(", ") || "none"}.`,
    ].join("\n");
    chunks.push({ id: f.fir_no, label: `FIR ${f.fir_no}`, text, caseIds: [f.fir_no] });
  }

  // 2. Persons of interest (members + burner).
  const members = [...networkMembers, burner as unknown as NetworkMember];
  for (const m of members) {
    const firsOf = firsForMember(m);
    const text = [
      `${m.name}${m.alias ? ` (alias "${m.alias}")` : ""} — ${m.role}, ${m.cluster} cluster, based in ${m.city}.`,
      `Phone: ${m.phone}${m.phone2 ? `, secondary ${m.phone2}` : ""}.`,
      `Address: ${m.addr}.`,
      `Appears in FIRs: ${firsOf.join(", ") || "none"}.`,
    ].join("\n");
    chunks.push({ id: `member:${m.key}`, label: m.name, text, caseIds: firsOf });
  }

  // 3. Analyst findings (discoveries) — cross-case findings.
  for (const [key, d] of Object.entries(discoveries)) {
    const text = Object.entries(d)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join("\n");
    chunks.push({ id: `finding:${key}`, label: `Finding: ${key.replace(/_/g, " ")}`, text, caseIds: firNosIn(text) });
  }

  // 4. Financial / money-trail summary (global — money is inherently cross-case).
  const real = financial.filter((t) => t.from_name !== "Network internal" && t.to_name !== "Network internal");
  if (real.length) {
    const text = [
      `Financial transactions (${real.length} non-internal records):`,
      ...real.map((t) => `${t.date}: ${t.from_name} → ${t.to_name} ₹${t.amount.toLocaleString("en-IN")} via ${t.method} (${t.bank}) — ${t.remark}`),
    ].join("\n");
    chunks.push({ id: "financial", label: "Financial records", text, caseIds: [] });
  }

  return chunks;
}
