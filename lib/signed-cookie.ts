import { createHmac, timingSafeEqual } from "node:crypto";

/** Session secret: at least 32 bytes. Missing or short means auth is off. */
export function signingSecret(): string | null {
  const value = process.env.SESSION_SECRET;
  if (!value) return null;
  return Buffer.byteLength(value, "utf8") >= 32 ? value : null;
}

/** Returns `base64url(payload).base64url(hmac)`, or null without a secret. */
export function signPayload(value: unknown): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPayload<T>(token: string | null | undefined): T | null {
  const secret = signingSecret();
  if (!secret || !token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) return null;
  if (!timingSafeEqual(provided, computed)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
