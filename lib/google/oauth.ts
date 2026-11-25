// events (not full `calendar`): lets the app list and insert events without
// rights over sharing, calendars or settings.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const OPENID_SCOPES = ["openid", "email", "profile"];

/** Grants that allow writing events. */
const CALENDAR_WRITE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

/** Grants that allow reading events, including read-only ones. */
const CALENDAR_READ_SCOPES = [
  ...CALENDAR_WRITE_SCOPES,
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export const CALENDAR_SCOPES = [CALENDAR_SCOPE];

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export class GoogleAuthError extends Error {
  code:
    | "not_configured"
    | "invalid_grant"
    | "refresh_failed"
    | "exchange_failed";

  constructor(code: GoogleAuthError["code"], message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(appUrl: string) {
  return `${appUrl.replace(/\/+$/, "")}/auth/callback`;
}

export function hasCalendarScope(scopes: string[]) {
  return scopes.some((scope) => CALENDAR_READ_SCOPES.includes(scope));
}

/** True only when the grant can also add events. */
export function hasCalendarWriteScope(scopes: string[]) {
  return scopes.some((scope) => CALENDAR_WRITE_SCOPES.includes(scope));
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [...OPENID_SCOPES, CALENDAR_SCOPE].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export interface AuthorizedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scopes: string[];
  idToken: string | null;
}

/** Authorization-code exchange with PKCE. */
export async function exchangeAuthorizationCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<AuthorizedTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      "not_configured",
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.",
    );
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.codeVerifier,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as TokenResponse | null;

  if (!response.ok || !payload?.access_token) {
    throw new GoogleAuthError(
      "exchange_failed",
      payload?.error_description ||
        `Google authorization code exchange failed (${response.status}).`,
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresInSeconds: payload.expires_in ?? 3600,
    scopes: (payload.scope ?? "").split(" ").filter(Boolean),
    idToken: payload.id_token ?? null,
  };
}

export interface RefreshedToken {
  accessToken: string;
  expiresInSeconds: number;
  scope: string[];
}

export async function exchangeRefreshToken(refreshToken: string): Promise<RefreshedToken> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      "not_configured",
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set, so the server cannot refresh the calendar token.",
    );
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as TokenResponse | null;

  if (!response.ok || !payload?.access_token) {
    if (payload?.error === "invalid_grant") {
      throw new GoogleAuthError(
        "invalid_grant",
        "Google rejected the stored refresh token. The user must reconnect the calendar.",
      );
    }
    throw new GoogleAuthError(
      "refresh_failed",
      payload?.error_description || `Google token refresh failed (${response.status}).`,
    );
  }

  return {
    accessToken: payload.access_token,
    expiresInSeconds: payload.expires_in ?? 3600,
    scope: (payload.scope ?? "").split(" ").filter(Boolean),
  };
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

function isValidIssuer(issuer: string) {
  return issuer === "accounts.google.com" || issuer === "https://accounts.google.com";
}

/**
 * Verifies the ID token with Google's tokeninfo endpoint and checks audience,
 * issuer and expiry. Avoids shipping a JWKS verifier for this prototype.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, string | number>;
    const audience = String(payload.aud ?? "");
    const issuer = String(payload.iss ?? "");
    const expires = Number(payload.exp ?? 0);
    const emailVerified = String(payload.email_verified ?? "");

    if (audience !== clientId) return null;
    if (!isValidIssuer(issuer)) return null;
    if (!expires || expires * 1000 < Date.now()) return null;
    if (emailVerified === "false") return null;
    if (!payload.sub) return null;

    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      name: payload.name ? String(payload.name) : null,
      picture: payload.picture ? String(payload.picture) : null,
    };
  } catch {
    return null;
  }
}

/** Fallback identity lookup if Google omits the id_token. */
export async function fetchGoogleIdentity(accessToken: string): Promise<GoogleIdentity | null> {
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: payload.email ?? "",
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  } catch {
    return null;
  }
}

/** Reads the scopes Google actually granted for an access token. */
export async function fetchGrantedScopes(accessToken: string | null | undefined) {
  if (!accessToken) return [];
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as { scope?: string };
    return (payload.scope ?? "").split(" ").filter(Boolean);
  } catch {
    return [];
  }
}
