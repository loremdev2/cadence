import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthUrl, googleOAuthConfigured, googleRedirectUri } from "@/lib/google/oauth";
import { safeNextPath } from "@/lib/redirects";
import { attachOAuthStateCookie, sessionSecretConfigured } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=not_configured", origin));
  }
  if (!sessionSecretConfigured()) {
    return NextResponse.redirect(new URL("/login?error=session_secret_missing", origin));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const authorizationUrl = buildGoogleAuthUrl({
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    redirectUri: googleRedirectUri(appUrl),
    state,
    codeChallenge: challenge,
  });

  const response = NextResponse.redirect(authorizationUrl);
  return attachOAuthStateCookie(response, {
    state,
    verifier,
    next,
    exp: Date.now() + 10 * 60 * 1000,
  });
}
