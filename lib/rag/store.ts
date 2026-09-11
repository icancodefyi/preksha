// In-memory vector store: index the corpus once (lazily), then hybrid-search
// (cosine + lexical token boost) per query with optional case scoping. No
// external vector DB, no daemon — fast and zero-setup.
import { embedPassages } from "./embeddings";
import { buildCorpus } from "./corpus";
import type { SourceChunk, ScoredChunk } from "./types";

let _index: { chunk: SourceChunk; vector: number[] }[] | null = null;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function getIndex(): Promise<{ chunk: SourceChunk; vector: number[] }[]> {
  if (_index) return _index;
  const chunks = buildCorpus();
  const vectors = await embedPassages(chunks.map((c) => c.text));
  _index = chunks.map((chunk, i) => ({ chunk, vector: vectors[i] }));
  return _index;
}

/**
 * Hybrid search: cosine similarity plus a lexical boost for query tokens that
 * literally appear in the chunk — so exact names / phones / FIR numbers always
 * clear the gate even when the vector similarity alone is weak.
 */
export async function search(
  queryVector: number[],
  rawQuery: string,
  topK: number,
  caseFirNos?: string[],
): Promise<ScoredChunk[]> {
  const index = await getIndex();
  const candidates = caseFirNos
    ? index.filter((p) => p.chunk.caseIds.some((id) => caseFirNos.includes(id)))
    : index;

  const tokens = (rawQuery.toLowerCase().match(/\b[a-z0-9][a-z0-9./-]{1,}\b/g) ?? []).filter(
    (t) => t.length > 1,
  );

  return candidates
    .map((p) => {
      const cos = cosine(queryVector, p.vector);
      const lower = p.chunk.text.toLowerCase();
      const matched = tokens.filter((t) => lower.includes(t)).length;
      const boost = tokens.length ? (matched / tokens.length) * 0.35 : 0;
      return { ...p.chunk, score: Math.min(1, cos + boost) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
