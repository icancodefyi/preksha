import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";

// Phase 9.1: authorization = role x case-assignment, evaluated once, centrally.
// Every case-scoped route handler must go through this module — never hand-roll
// a case check inline (that's exactly the per-endpoint discipline Phase 2.14
// says is forgettable and unauditable as a set).

export type AccessLevel = "read" | "contribute" | "manage";
const LEVEL_RANK: Record<AccessLevel, number> = { read: 1, contribute: 2, manage: 3 };

const SENSITIVE_CASE_ROLES = ["supervisor", "admin"];

/**
 * Throws 403 (not 404 — Phase 11: a 404 here would leak whether the case
 * exists to an unauthorized caller) if the user cannot access caseId at
 * minLevel. Every denial is audit-logged.
 */
export async function requireCaseAccess(
  user: SessionUser,
  caseId: string,
  minLevel: AccessLevel = "read",
): Promise<void> {
  const [assignment, caseRow] = await Promise.all([
    prisma.caseAssignment.findUnique({
      where: { caseId_userId: { caseId, userId: user.id } },
    }),
    prisma.case.findUnique({ where: { id: caseId }, select: { sensitivity: true } }),
  ]);

  const hasLevel = !!assignment && LEVEL_RANK[assignment.accessLevel as AccessLevel] >= LEVEL_RANK[minLevel];
  const sensitivityOk =
    !caseRow ||
    caseRow.sensitivity !== "restricted" ||
    user.roles.some((r) => SENSITIVE_CASE_ROLES.includes(r));

  if (!caseRow || !hasLevel || !sensitivityOk) {
    await writeAudit({
      actorId: user.id,
      action: "authz_denied",
      caseId,
      resourceRef: `case:${caseId}`,
      requestSummary: { minLevel },
    });
    throw new ApiError(403, "forbidden", "Not authorized for this case");
  }
}

/** All case ids the user currently holds any assignment on (Phase 9.3). */
export async function authorizedCaseIds(user: SessionUser): Promise<string[]> {
  const rows = await prisma.caseAssignment.findMany({
    where: { userId: user.id },
    select: { caseId: true },
  });
  return rows.map((r) => r.caseId);
}

/**
 * Cross-case correlation is a distinct, always-logged operation (Phase 6.3 /
 * 9.2 / Gap #9) even when every requested case is individually authorized —
 * it is never a side effect of an unscoped query.
 */
export async function requireCrossCaseAccess(
  user: SessionUser,
  requestedCaseIds: string[],
): Promise<string[]> {
  const authorized = new Set(await authorizedCaseIds(user));
  const allowed = requestedCaseIds.filter((id) => authorized.has(id));
  const denied = requestedCaseIds.filter((id) => !authorized.has(id));

  await writeAudit({
    actorId: user.id,
    action: "cross_case_correlation",
    resourceRef: allowed.join(","),
    requestSummary: { requested: requestedCaseIds },
    resultSummary: { allowed, denied },
  });

  if (allowed.length === 0) {
    throw new ApiError(403, "forbidden", "Not authorized for any requested case");
  }
  return allowed;
}

export function requireRole(user: SessionUser, allowed: string[]): void {
  if (!user.roles.some((r) => allowed.includes(r))) {
    throw new ApiError(403, "forbidden", `Requires one of roles: ${allowed.join(", ")}`);
  }
}
