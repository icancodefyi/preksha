import type { NextRequest } from "next/server";
import { reconstructCrime } from "@/lib/graph/enrich";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ idx: string }> }) {
  const { idx } = await ctx.params;
  const num = Number(idx);
  const rec = reconstructCrime(Number.isFinite(num) ? num : idx);
  if (!rec) return Response.json({ error: "FIR not found" }, { status: 404 });
  return Response.json(rec);
}