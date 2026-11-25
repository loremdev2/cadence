import { NextResponse, type NextRequest } from "next/server";
import { demoEventsForRange } from "@/lib/demo-data";
import { CalendarError, listGoogleEvents } from "@/lib/google/calendar";
import { getSession } from "@/lib/session";
import { storageConfigured } from "@/lib/supabase/admin";
import { safeTimeZone } from "@/lib/timezone";
import type { CalendarMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_RANGE_DAYS = 62;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode: CalendarMode = params.get("mode") === "live" ? "live" : "demo";
  const startParam = params.get("start");
  const endParam = params.get("end");
  const timeZone = safeTimeZone(params.get("tz"));

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: "start and end are required", code: "bad_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const start = new Date(startParam);
  const end = new Date(endParam);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000
  ) {
    return NextResponse.json(
      { error: "Invalid date range", code: "bad_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  if (mode === "demo") {
    return NextResponse.json(
      {
        mode,
        timeZone,
        calendarEmail: null,
        events: demoEventsForRange(start.toISOString(), end.toISOString(), timeZone),
      },
      { headers: NO_STORE },
    );
  }

  if (!storageConfigured()) {
    return NextResponse.json(
      {
        error:
          "Storage is not configured in this environment. Demo mode is fully available.",
        code: "not_configured",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to read your calendar.", code: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const result = await listGoogleEvents(
      session.userId,
      start.toISOString(),
      end.toISOString(),
    );
    return NextResponse.json(
      {
        mode,
        timeZone: result.timeZone ?? timeZone,
        calendarEmail: result.calendarEmail,
        events: result.events,
      },
      { headers: NO_STORE },
    );
  } catch (cause) {
    if (cause instanceof CalendarError) {
      return NextResponse.json(
        { error: cause.message, code: cause.code },
        { status: cause.status, headers: NO_STORE },
      );
    }
    console.error("calendar fetch failed", cause);
    return NextResponse.json(
      { error: "The calendar could not be loaded.", code: "api_error" },
      { status: 500, headers: NO_STORE },
    );
  }
}
