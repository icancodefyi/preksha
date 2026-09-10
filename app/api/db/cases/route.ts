import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

// Phase 11: lists only cases the caller is assigned to — never the full
// cases table. There is no "list everything" path, even for admins; admin
// access to a specific case still requires a case_assignment row (Phase 2.14).
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const assignments = await prisma.caseAssignment.findMany({
      where: { userId: user.id },
      include: { case: true },
      orderBy: { grantedAt: "desc" },
    });
    return NextResponse.json({
      cases: assignments.map((a) => ({ ...a.case, myAccessLevel: a.accessLevel })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

// Any authenticated investigator can open a new case (mirrors real
// investigative workflow); the creator is auto-granted "manage" on it via a
// normal case_assignment row — creating a case never implies visibility into
// any OTHER case (Principle 10).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const sensitivity = body?.sensitivity === "restricted" ? "restricted" : "standard";
    if (!title || title.length > 200) {
      throw new ApiError(422, "validation_error", "title is required (max 200 chars)");
    }

    const kase = await prisma.$transaction(async (tx) => {
      const created = await tx.case.create({ data: { title, sensitivity, createdById: user.id } });
      await tx.caseAssignment.create({
        data: { caseId: created.id, userId: user.id, accessLevel: "manage", grantedById: user.id },
      });
      return created;
    });

    await writeAudit({ actorId: user.id, action: "create_case", caseId: kase.id, requestSummary: { title, sensitivity } });

    return NextResponse.json({ case: kase }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
