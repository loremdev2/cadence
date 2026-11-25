import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { signPayload, signingSecret, verifyPayload } from "./signed-cookie";

export const SESSION_COOKIE = "cadence_session";
export const OAUTH_COOKIE = "cadence_oauth";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionUser {
  userId: string;
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

interface SessionPayload extends SessionUser {
  exp: number;
}

export interface OAuthStatePayload {
  state: string;
  verifier: string;
  next: string;
  exp: number;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function sessionSecretConfigured() {
  return Boolean(signingSecret());
}

export function createSessionToken(user: SessionUser): string | null {
  return signPayload({
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
}

export function readSessionToken(token: string | null | undefined): SessionUser | null {
  const payload = verifyPayload<SessionPayload>(token);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  if (!payload.userId || !payload.sub) return null;
  return {
    userId: payload.userId,
    sub: payload.sub,
    email: payload.email ?? "",
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

export function attachSessionCookie(response: NextResponse, user: SessionUser) {
  const token = createSessionToken(user);
  if (token) {
    response.cookies.set(SESSION_COOKIE, token, {
      ...cookieOptions,
      maxAge: SESSION_TTL_SECONDS,
    });
  }
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}

/** OAuth state + PKCE verifier, valid for ten minutes. `exp` is milliseconds. */
export function attachOAuthStateCookie(
  response: NextResponse,
  payload: OAuthStatePayload,
) {
  const token = signPayload(payload);
  if (token) {
    response.cookies.set(OAUTH_COOKIE, token, { ...cookieOptions, maxAge: 600 });
  }
  return response;
}

export function readOAuthState(token: string | null | undefined): OAuthStatePayload | null {
  const payload = verifyPayload<OAuthStatePayload>(token);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  if (!payload.state || !payload.verifier) return null;
  return payload;
}

export function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set(OAUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
