import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";

export const runtime = "nodejs";

interface SearchHit {
  type: "phone" | "person" | "fir" | "financial_entity";
  ref: string;
  label: string;
  matchedIn: string;
}

// Deterministic substring search across ingested case data (Phase 11
// /search) — this answers ENTITY_LOOKUP-shaped questions without ever
// routing through the LLM (Principle 2).
export async function GET(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/search">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "read");

    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    if (!q || q.length < 2) throw new ApiError(422, "validation_error", "q must be at least 2 characters");

    const [comm, fin, firs] = await Promise.all([
      prisma.communicationEvent.findMany({
        where: { caseId, OR: [{ caller: { contains: q } }, { receiver: { contains: q } }] },
        select: { caller: true, receiver: true },
        take: 50,
      }),
      prisma.transaction.findMany({
        where: { caseId, OR: [{ fromName: { contains: q } }, { toName: { contains: q } }] },
        select: { fromName: true, toName: true },
        take: 50,
      }),
      prisma.fir.findMany({ where: { caseId }, select: { id: true, firNo: true, extractedEntities: true } }),
    ]);

    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    const add = (hit: SearchHit) => {
      const key = `${hit.type}:${hit.ref}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push(hit);
    };

    for (const c of comm) {
      if (c.caller.toLowerCase().includes(q)) add({ type: "phone", ref: c.caller, label: c.caller, matchedIn: "communication_events" });
      if (c.receiver.toLowerCase().includes(q)) add({ type: "phone", ref: c.receiver, label: c.receiver, matchedIn: "communication_events" });
    }
    for (const t of fin) {
      if (t.fromName.toLowerCase().includes(q)) add({ type: "financial_entity", ref: t.fromName, label: t.fromName, matchedIn: "transactions" });
      if (t.toName.toLowerCase().includes(q)) add({ type: "financial_entity", ref: t.toName, label: t.toName, matchedIn: "transactions" });
    }
    for (const f of firs) {
      const entities = f.extractedEntities as { persons?: string[]; phones?: string[] } | null;
      if (f.firNo?.toLowerCase().includes(q)) add({ type: "fir", ref: f.id, label: f.firNo, matchedIn: "firs" });
      for (const p of entities?.persons ?? []) {
        if (p.toLowerCase().includes(q)) add({ type: "person", ref: p, label: p, matchedIn: `fir:${f.firNo ?? f.id}` });
      }
      for (const ph of entities?.phones ?? []) {
        if (ph.includes(q)) add({ type: "phone", ref: ph, label: ph, matchedIn: `fir:${f.firNo ?? f.id}` });
      }
    }

    return NextResponse.json({ query: q, hits: hits.slice(0, 50) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
