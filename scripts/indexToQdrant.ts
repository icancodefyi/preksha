// One-time (re-runnable) indexer: embeds the local demo corpus — FIR
// narratives + the pre-computed "discoveries" findings — into Qdrant Cloud.
// Recreates the collection each run, so this is idempotent by design rather
// than by dedup logic.
import { randomUUID } from "node:crypto";
import { qdrant, COLLECTION } from "@/lib/rag/qdrantClient";
import { embedPassages, EMBEDDING_DIM } from "@/lib/rag/jina";
import { firs, discoveries } from "@/lib/data/seed";

interface Doc {
  sourceType: "fir" | "discovery";
  sourceId: string;
  label: string;
  text: string;
}

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

  return docs;
}

async function main() {
  const docs = buildCorpus();
  console.log(`Corpus: ${docs.length} documents (${docs.filter((d) => d.sourceType === "fir").length} FIRs, ${docs.filter((d) => d.sourceType === "discovery").length} discoveries)`);

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
