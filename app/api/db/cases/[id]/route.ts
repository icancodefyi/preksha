import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, id, "read"); // Phase 3 Principle 3: gate before any data access

    const kase = await prisma.case.findUniqueOrThrow({ where: { id } });
    await writeAudit({ actorId: user.id, action: "view_case", caseId: id });

    return NextResponse.json({ case: kase });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
