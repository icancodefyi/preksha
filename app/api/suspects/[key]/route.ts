import type { NextRequest } from "next/server";
import { dossier } from "@/lib/graph/enrich";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const d = dossier(key);
  if (!d) return Response.json({ error: "suspect not found" }, { status: 404 });
  return Response.json(d);
}