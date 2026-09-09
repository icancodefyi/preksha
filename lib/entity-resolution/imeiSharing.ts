import { prisma } from "@/lib/db/client";

// Phase 5.3 deterministic tier: IMEI is a hardware identifier, so two phone
// numbers observed using the same IMEI is treated as a HIGH-confidence,
// auto-accepted signal (never a name-similarity guess — Phase 2.2/ADR-06).
// Still logged as a reviewable candidate row, just pre-accepted, so it stays
// reversible (a human can flip status back to "rejected" later).
const AUTO_ACCEPT_SCORE = 0.95;

export async function detectImeiSharing(caseId: string): Promise<number> {
  const events = await prisma.communicationEvent.findMany({
    where: { caseId, imeiCaller: { not: null } },
    select: { caller: true, imeiCaller: true },
  });

  const phonesByImei = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.imeiCaller) continue;
    const set = phonesByImei.get(e.imeiCaller) ?? new Set();
    set.add(e.caller);
    phonesByImei.set(e.imeiCaller, set);
  }

  let created = 0;
  for (const [imei, phones] of phonesByImei) {
    if (phones.size < 2) continue;
    const list = [...phones].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const entityARef = `phone:${list[i]}`;
        const entityBRef = `phone:${list[j]}`;
        // Idempotency: skip if a candidate for this exact pair already exists.
        const already = await prisma.entityResolutionCandidate.findFirst({
          where: { caseId, entityARef, entityBRef },
        });
        if (already) continue;
        await prisma.entityResolutionCandidate.create({
          data: {
            caseId,
            entityARef,
            entityBRef,
            score: AUTO_ACCEPT_SCORE,
            signals: { shared_imei: imei },
            status: "accepted",
            decidedAt: new Date(),
          },
        });
        created += 1;
      }
    }
  }
  return created;
}
