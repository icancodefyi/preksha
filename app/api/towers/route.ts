import { towerDump, towers } from "@/lib/data/seed";

// Raw tower-dump pings + tower metadata — exposed so the Python RAG
// indexer can do its own co-location grouping (same responsibility split
// as the rest of /reindex: Next.js exposes derived/raw data it already
// has, Python builds the corpus text from it).
export async function GET() {
  return Response.json({ towerDump, towers });
}
