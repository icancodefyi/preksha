import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/http/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ user });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
