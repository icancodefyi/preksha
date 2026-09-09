import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";

// Append-only by convention (Phase 7/9.2): no update/delete helper is exported here.
export async function writeAudit(entry: {
  actorId: string | null;
  action: string;
  caseId?: string | null;
  resourceRef?: string | null;
  requestSummary?: Prisma.InputJsonValue;
  resultSummary?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      caseId: entry.caseId ?? null,
      resourceRef: entry.resourceRef ?? null,
      requestSummary: entry.requestSummary ?? Prisma.JsonNull,
      resultSummary: entry.resultSummary ?? Prisma.JsonNull,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
