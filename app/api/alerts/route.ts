import { patternAlerts } from "@/lib/graph/enrich";

export async function GET() {
  return Response.json(patternAlerts());
}