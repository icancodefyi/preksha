import { NextResponse } from "next/server";
import { buildSimulation } from "@/lib/graph/simulation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const firParam = searchParams.get("fir");
  const idx = firParam ? Number.parseInt(firParam, 10) : 4;
  const sim = buildSimulation(Number.isNaN(idx) ? 4 : idx);
  if (!sim) {
    return NextResponse.json({ error: "No simulation for that case" }, { status: 404 });
  }
  return NextResponse.json(sim);
}
