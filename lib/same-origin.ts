import type { NextRequest } from "next/server";

/**
 * Guards cookie-authenticated mutations. A browser request from another site
 * carries that site's Origin, which cannot match our Host.
 */
export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
