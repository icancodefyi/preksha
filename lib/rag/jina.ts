// Jina Embeddings v3 — 1024-dim, supports asymmetric retrieval task hints
// (index passages with "retrieval.passage", embed queries with
// "retrieval.query" — this measurably improves retrieval quality over using
// the same embedding mode for both sides).
const JINA_URL = "https://api.jina.ai/v1/embeddings";
const MODEL = "jina-embeddings-v3";
export const EMBEDDING_DIM = 1024;

type Task = "retrieval.passage" | "retrieval.query";

export async function embed(texts: string[], task: Task): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error("JINA_API_KEY is not set");

  const res = await fetch(JINA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, task, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`Jina embeddings request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedPassages(texts: string[]): Promise<number[][]> {
  return embed(texts, "retrieval.passage");
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embed([text], "retrieval.query");
  return v;
}
