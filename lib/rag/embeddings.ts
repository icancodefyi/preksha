// Embeddings: Jina v3 (API) with a deterministic bag-of-words fallback so the
// pipeline never hard-crashes when JINA_API_KEY is missing. Jina is the real
// semantic path; the fallback is a coarse lexical embedding that keeps cosine
// retrieval functional offline.

const JINA_URL = "https://api.jina.ai/v1/embeddings";
const MODEL = "jina-embeddings-v3";
export const EMBED_DIM = 1024;

function hashEmbed(text: string, dim = EMBED_DIM): number[] {
  const v = new Array(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const t of tokens) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    v[h % dim] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function jinaEmbed(texts: string[], task: "retrieval.passage" | "retrieval.query"): Promise<number[][] | null> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(JINA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, task, input: texts }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch {
    return null;
  }
}

export async function embedPassages(texts: string[]): Promise<number[][]> {
  const real = await jinaEmbed(texts, "retrieval.passage");
  if (real) return real;
  return texts.map((t) => hashEmbed(t));
}

export async function embedQuery(text: string): Promise<number[]> {
  const real = await jinaEmbed([text], "retrieval.query");
  if (real) return real[0];
  return hashEmbed(text);
}
