import { listCases } from "@/lib/data/cases";

export async function GET() {
  return Response.json(listCases());
}
