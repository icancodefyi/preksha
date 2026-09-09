import { overview } from "@/lib/graph/enrich";

export async function GET() {
  return Response.json(overview());
}