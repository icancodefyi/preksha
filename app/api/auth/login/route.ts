import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/session";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username : null;
    const password = typeof body?.password === "string" ? body.password : null;
    if (!username || !password) {
      throw new ApiError(422, "validation_error", "username and password are required");
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { roles: { include: { role: true } } },
    });

    // Same generic error whether the user doesn't exist or the password is
    // wrong — do not leak which one via message or timing-distinguishable path.
    const valid = user?.isActive ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) {
      await writeAudit({ actorId: user?.id ?? null, action: "login_failed", requestSummary: { username } });
      throw new ApiError(401, "invalid_credentials", "Invalid username or password");
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(user.id),
      signRefreshToken(user.id),
    ]);

    await writeAudit({ actorId: user.id, action: "login" });

    const res = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: user.roles.map((r) => r.role.name),
      },
    });
    res.cookies.set(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60,
    });
    res.cookies.set(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return res;
  } catch (err) {
    return apiErrorResponse(err);
  }
}
