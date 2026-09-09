import { rankedSuspects } from "@/lib/graph/enrich";

export async function GET() {
  return Response.json(rankedSuspects());
}