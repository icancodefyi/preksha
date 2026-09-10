import { discoveries } from "@/lib/data/seed";

export async function GET() {
  return Response.json(discoveries);
}
