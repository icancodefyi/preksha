import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ApiError } from "@/lib/http/errors";

export const ACCESS_COOKIE = "ff_access";
export const REFRESH_COOKIE = "ff_refresh";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return req.cookies.get(ACCESS_COOKIE)?.value ?? null;
}

// Returns null instead of throwing — callers that allow anonymous access
// (e.g. the login route itself) can use this directly.
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = extractToken(req);
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roles: user.roles.map((r) => r.role.name),
  };
}

// The mandatory pre-retrieval gate (Phase 3 Principle 3 / Phase 9.1): call this
// first in every route handler that requires authentication. Never proceed to
// a data-access call without it.
export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new ApiError(401, "unauthenticated", "Missing or invalid access token");
  return user;
}
