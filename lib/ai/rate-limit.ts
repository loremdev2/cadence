import { createHmac } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";

interface LimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface MemoryWindow {
  start: number;
  hits: number;
}

const memoryWindows = new Map<string, MemoryWindow>();
let warnedAboutDatabaseFallback = false;

function positiveEnvInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function privateBucket(principal: string) {
  const secret = process.env.OPENROUTER_API_KEY ?? process.env.SESSION_SECRET ?? "cadence-local-rate-limit";
  return createHmac("sha256", secret).update(principal).digest("hex");
}

function takeMemoryWindow(key: string, limit: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  let entry = memoryWindows.get(key);
  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, hits: 0 };
  }
  entry.hits += 1;
  memoryWindows.set(key, entry);

  if (memoryWindows.size > 5000) {
    for (const [candidate, window] of memoryWindows) {
      if (now - window.start >= windowMs * 2) memoryWindows.delete(candidate);
    }
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((entry.start + windowMs - now) / 1000),
  );
  return { allowed: entry.hits <= limit, retryAfterSeconds };
}

async function takeWindow(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const client = getAdminClient();
  if (!client) return takeMemoryWindow(key, limit, windowSeconds);

  const { data, error } = await client.rpc("consume_ai_rate_limit", {
    p_bucket: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row.allowed === "boolean") {
      return {
        allowed: row.allowed,
        retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
      };
    }
  } else if (!warnedAboutDatabaseFallback) {
    warnedAboutDatabaseFallback = true;
    console.warn("AI rate-limit storage unavailable; using process-local limits:", error.message);
  }

  return takeMemoryWindow(key, limit, windowSeconds);
}

/** Limits both a caller and total key usage; Supabase RPC counters are atomic. */
export async function checkAiRateLimit(principal: string): Promise<LimitResult> {
  const hashedPrincipal = privateBucket(principal);
  const checks = [
    takeWindow(
      `ai:principal:${hashedPrincipal}:minute`,
      positiveEnvInt("AI_RATE_LIMIT_PER_MINUTE", 10),
      60,
    ),
    takeWindow(
      `ai:principal:${hashedPrincipal}:day`,
      positiveEnvInt("AI_RATE_LIMIT_PER_DAY", 50),
      86_400,
    ),
    takeWindow(
      "ai:global:day",
      positiveEnvInt("AI_RATE_LIMIT_GLOBAL_PER_DAY", 500),
      86_400,
    ),
  ];

  const results = await Promise.all(checks);
  const blocked = results.find((result) => !result.allowed);
  return blocked ?? { allowed: true, retryAfterSeconds: 0 };
}
