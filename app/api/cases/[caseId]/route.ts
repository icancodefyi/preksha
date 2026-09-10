import { getCase } from "@/lib/data/cases";
import { rankedSuspects } from "@/lib/graph/enrich";
import { cdr, towerDump, networkMembers } from "@/lib/data/seed";

export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[caseId]">) {
  const { caseId } = await ctx.params;
  const kase = getCase(caseId);
  if (!kase) return Response.json({ error: "Case not found" }, { status: 404 });

  const suspectKeySet = new Set(kase.suspectKeys);
  const suspects = rankedSuspects().filter((s) => suspectKeySet.has(s.key));

  // "Files" activity summary — the local dataset is one CDR/tower-dump
  // table, not discrete per-case uploads, so this counts records touching
  // this case's suspects rather than listing separate files (see plan).
  const casePhones = new Set(
    networkMembers.filter((m) => suspectKeySet.has(m.key)).flatMap((m) => [m.phone, m.phone2].filter(Boolean)),
  );
  const callCount = cdr.filter((c) => casePhones.has(c.caller) || casePhones.has(c.receiver)).length;
  const towerHitCount = towerDump.filter((d) => casePhones.has(d.phone)).length;

  return Response.json({
    ...kase,
    suspects,
    activity: { firCount: kase.firCount, callCount, towerHitCount },
  });
}
