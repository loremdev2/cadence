import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto";
import {
  exchangeAuthorizationCode,
  fetchGoogleIdentity,
  googleOAuthConfigured,
  googleRedirectUri,
  hasCalendarScope,
  verifyGoogleIdToken,
} from "@/lib/google/oauth";
import { safeNextPath } from "@/lib/redirects";
import {
  OAUTH_COOKIE,
  attachSessionCookie,
  clearOAuthStateCookie,
  readOAuthState,
} from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const redirect = (path: string) => NextResponse.redirect(new URL(path, origin));

  if (searchParams.get("error")) return redirect("/login?error=consent_denied");
  if (!googleOAuthConfigured()) return redirect("/login?error=not_configured");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return redirect("/login?error=missing_code");

  const pending = readOAuthState(request.cookies.get(OAUTH_COOKIE)?.value);
  if (!pending || pending.state !== state) {
    return redirect("/login?error=oauth_state");
  }

  const next = safeNextPath(pending.next);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;

  let tokens;
  try {
    tokens = await exchangeAuthorizationCode({
      code,
      codeVerifier: pending.verifier,
      redirectUri: googleRedirectUri(appUrl),
    });
  } catch (cause) {
    console.error(
      "google code exchange failed",
      cause instanceof Error ? cause.message : cause,
    );
    return redirect("/login?error=exchange_failed");
  }

  const identity = tokens.idToken
    ? await verifyGoogleIdToken(tokens.idToken)
    : await fetchGoogleIdentity(tokens.accessToken);
  if (!identity) return redirect("/login?error=identity_unverified");

  const admin = getAdminClient();
  if (!admin) return redirect("/settings?error=storage_not_configured");
  if (!encryptionAvailable()) {
    return redirect(`${next}?error=encryption_not_configured`);
  }

  const { data: existingUser } = await admin
    .from("app_users")
    .select("id")
    .eq("google_sub", identity.sub)
    .maybeSingle();

  let userId = existingUser?.id as string | undefined;

  if (!userId) {
    const { data: created, error } = await admin
      .from("app_users")
      .insert({
        google_sub: identity.sub,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
      })
      .select("id")
      .single();

    if (error || !created) {
      console.error("user store failed", error?.message);
      return redirect("/login?error=user_store_failed");
    }
    userId = created.id as string;
  } else {
    await admin
      .from("app_users")
      .update({
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  const { data: existingConnection } = await admin
    .from("calendar_connections")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle();

  let refreshTokenEnc = (existingConnection?.refresh_token_enc as string | null) ?? null;
  if (tokens.refreshToken) {
    try {
      refreshTokenEnc = encryptSecret(tokens.refreshToken);
    } catch (cause) {
      console.error("refresh token encryption failed", cause);
    }
  }

  let accessTokenEnc: string | null = null;
  try {
    accessTokenEnc = encryptSecret(tokens.accessToken);
  } catch (cause) {
    console.error("access token encryption failed", cause);
  }

  // The exchange response lists the granted scopes; if it is missing, fall
  // back to what the token itself reports.
  let scopes = tokens.scopes;
  if (scopes.length === 0) {
    const { fetchGrantedScopes } = await import("@/lib/google/oauth");
    scopes = await fetchGrantedScopes(tokens.accessToken);
  }

  const calendarOk = hasCalendarScope(scopes);
  const status = calendarOk && refreshTokenEnc ? "connected" : "missing_scope";

  const { error: upsertError } = await admin.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider: "google",
      google_email: identity.email || null,
      scopes,
      refresh_token_enc: refreshTokenEnc,
      access_token_enc: accessTokenEnc,
      access_token_expires_at: new Date(
        Date.now() + Math.max(tokens.expiresInSeconds - 120, 60) * 1000,
      ).toISOString(),
      status,
      last_error: calendarOk
        ? null
        : "Google Calendar permission was not granted. Reconnect and approve read-only calendar access.",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    console.error("connection storage failed", upsertError.message);
    return redirect(`${next}?error=storage_failed`);
  }

  const target = new URL(next, origin);
  target.searchParams.set("connected", calendarOk ? "1" : "0");

  const response = NextResponse.redirect(target);
  attachSessionCookie(response, {
    userId,
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    picture: identity.picture,
  });
  return clearOAuthStateCookie(response);
}
