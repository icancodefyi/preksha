import { SignJWT, jwtVerify } from "jose";

const secretEnv = process.env.JWT_SECRET;
if (!secretEnv) throw new Error("JWT_SECRET is not set");
const secret = new TextEncoder().encode(secretEnv);

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

export interface AccessTokenPayload {
  sub: string; // user id
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
}

// Role/case-assignment are deliberately NOT embedded in the token: they are
// looked up fresh from Postgres on every request (lib/auth/authorize.ts) so a
// revoked case assignment or role change takes effect immediately, not after
// token expiry. See docs/ARCHITECTURE.md Phase 9.1.
export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ type: "access" } satisfies Omit<AccessTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(secret);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ type: "refresh" } satisfies Omit<RefreshTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== "access" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub, type: "access" };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== "refresh" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub, type: "refresh" };
  } catch {
    return null;
  }
}
