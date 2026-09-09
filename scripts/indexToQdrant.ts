// One-time (re-runnable) indexer: embeds the local demo corpus — FIR
// narratives + the pre-computed "discoveries" findings — into Qdrant Cloud.
// Recreates the collection each run, so this is idempotent by design rather
// than by dedup logic.
import { randomUUID } from "node:crypto";
import { qdrant, COLLECTION } from "@/lib/rag/qdrantClient";
import { embedPassages, EMBEDDING_DIM } from "@/lib/rag/jina";
import { firs, discoveries, networkMembers } from "@/lib/data/seed";
import { dossier, patternAlerts, moneyFlowGraph } from "@/lib/graph/enrich";

interface Doc {
  sourceType: "fir" | "discovery" | "suspect_profile" | "pattern_alert" | "money_flow";
  sourceId: string;
  label: string;
  text: string;
}

// CDR/financial/tower-dump are ~10,750 near-duplicate raw rows ("call from
// X to Y at time Z") — embedding each one is both wasteful and semantically
// weak (thousands of nearly-identical vectors). Instead this indexes the
// already-computed DERIVED summaries over that same data — per-suspect
// dossiers (contacts, money, FIR links — all CDR/financial-backed), pattern
// alerts (bursts, burner detection — CDR/tower-dump-backed), and the money
// flow graph — which is both far richer to retrieve and directly answers
// "specific calls or transactions" questions the FIR-only corpus couldn't.

function buildCorpus(): Doc[] {
  const docs: Doc[] = [];

  for (const f of firs) {
    const accused = f.accused.map((a) => a.name ?? a.alias).filter(Boolean).join(", ");
    const text = [
      `FIR ${f.fir_no} — ${f.title} (${f.category}, ${f.year})`,
      `Police station: ${f.police_station}, ${f.district}, ${f.state}`,
      `Sections: ${f.sections.join(", ")}`,
      `Complainant: ${f.complainant.name}`,
      accused ? `Accused: ${accused}` : "",
      `Narrative: ${f.narrative}`,
    ]
      .filter(Boolean)
      .join("\n");
    docs.push({ sourceType: "fir", sourceId: f.fir_no, label: `FIR ${f.fir_no} — ${f.title}`, text });
  }

  for (const [key, entry] of Object.entries(discoveries)) {
    const text = Object.entries(entry)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    docs.push({ sourceType: "discovery", sourceId: key, label: `Finding: ${key.replace(/_/g, " ")}`, text });
  }

  for (const m of networkMembers) {
    const d = dossier(m.key);
    if (!d) continue;
    const text = [
      `${d.name}${d.alias ? ` (alias "${d.alias}")` : ""} — ${d.role}, ${d.cluster} cluster, based in ${d.city}.`,
      `Phone: ${d.phone}${d.phone2 ? `, secondary ${d.phone2}` : ""}.`,
      d.topContacts.length
        ? `Top CDR contacts: ${d.topContacts.map((c) => `${c.name} (${c.calls} calls)`).join(", ")}.`
        : "",
      d.money.txns > 0
        ? `Financial activity: ₹${Math.round(d.money.inflow).toLocaleString("en-IN")} inflow, ₹${Math.round(d.money.outflow).toLocaleString("en-IN")} outflow across ${d.money.txns} transactions.`
        : "",
      d.bankAccounts.length ? `Bank accounts: ${d.bankAccounts.map((b) => `${b.bank} ${b.acct}`).join(", ")}.` : "",
      d.firs.length ? `Linked FIRs: ${d.firs.map((f) => `${f.fir_no} (${f.title})`).join("; ")}.` : "",
      d.metrics ? `Network metrics: betweenness ${d.metrics.betweenness}, pagerank ${d.metrics.pagerank}.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    docs.push({ sourceType: "suspect_profile", sourceId: m.key, label: `Profile: ${d.name}`, text });
  }

  patternAlerts().forEach((a, i) => {
    const text = [`${a.title} (${a.severity} severity)`, a.detail, a.evidence.length ? `Evidence: ${a.evidence.join("; ")}` : ""]
      .filter(Boolean)
      .join("\n");
    // sourceId must be whitespace-free — it's matched later as a bracketed
    // citation token (lib/rag/localAnswer.ts), which excludes whitespace.
    docs.push({ sourceType: "pattern_alert", sourceId: `alert_${a.type}_${i}`, label: `Alert: ${a.title}`, text });
  });

  const mf = moneyFlowGraph();
  const topFlows = mf.edges.slice(0, 15);
  if (topFlows.length) {
    const text = [
      "Money flow graph — largest fund transfers between entities in the network:",
      ...topFlows.map((e) => `${e.from} -> ${e.to}: ₹${Math.round(e.amount).toLocaleString("en-IN")} across ${e.txns} transaction(s)`),
      "",
      "Entities by total volume: " +
        mf.nodes
          .slice(0, 10)
          .map((n) => `${n.name} (${n.role}, in ₹${Math.round(n.inflow).toLocaleString("en-IN")} / out ₹${Math.round(n.outflow).toLocaleString("en-IN")})`)
          .join(", "),
    ].join("\n");
    docs.push({ sourceType: "money_flow", sourceId: "money_flow_graph", label: "Money flow graph summary", text });
  }

  return docs;
}

async function main() {
  const docs = buildCorpus();
  const counts = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.sourceType] = (acc[d.sourceType] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Corpus: ${docs.length} documents — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);

  const exists = await qdrant.collectionExists(COLLECTION);
  if (exists.exists) {
    console.log(`Recreating existing collection "${COLLECTION}"...`);
    await qdrant.deleteCollection(COLLECTION);
  }
  await qdrant.createCollection(COLLECTION, { vectors: { size: EMBEDDING_DIM, distance: "Cosine" } });

  console.log("Embedding via Jina...");
  const vectors = await embedPassages(docs.map((d) => d.text));

  console.log("Upserting into Qdrant...");
  const points = docs.map((d, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload: { sourceType: d.sourceType, sourceId: d.sourceId, label: d.label, text: d.text },
  }));
  await qdrant.upsert(COLLECTION, { wait: true, points });

  const count = await qdrant.count(COLLECTION, {});
  console.log(`Done. Collection "${COLLECTION}" now has ${count.count} points.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
