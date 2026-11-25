import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { demoEventsForRange } from "@/lib/demo-data";
import {
  CalendarError,
  createGoogleEvent,
  listGoogleEvents,
  moveGoogleEvent,
} from "@/lib/google/calendar";
import { isSameOriginRequest } from "@/lib/same-origin";
import { getSession } from "@/lib/session";
import { storageConfigured } from "@/lib/supabase/admin";
import { safeTimeZone } from "@/lib/timezone";
import type { CalendarMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_RANGE_DAYS = 62;
const MIN_EVENT_MINUTES = 5;
const MAX_EVENT_HOURS = 12;

const createBodySchema = z.object({
  mode: z.enum(["demo", "live"]),
  title: z.string().trim().min(1).max(200),
  start: z.string().min(1).max(60),
  end: z.string().min(1).max(60),
  timeZone: z.string().max(80).optional(),
  description: z.string().max(11000).nullish(),
  location: z.string().max(500).nullish(),
  attendees: z.array(z.string().email().max(320)).max(100).nullish(),
});

const moveBodySchema = z.object({
  mode: z.enum(["demo", "live"]),
  eventId: z.string().min(1).max(400),
  start: z.string().min(1).max(60),
  end: z.string().min(1).max(60),
  timeZone: z.string().max(80).optional(),
});

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

/** Adds one event to the signed-in viewer's Google calendar. */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin request refused", code: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to add an event to your calendar.", code: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  if (!storageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not configured, so the calendar cannot be written.", code: "not_configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "bad_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "That event could not be read. Check its title, time, description, location, and attendee email addresses.",
        code: "bad_request",
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.message),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const data = parsed.data;
  if (data.mode === "demo") {
    return NextResponse.json(
      {
        error: "This is the demo calendar. Switch to your live calendar to add events.",
        code: "demo_mode",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const start = new Date(data.start);
  const end = new Date(data.end);
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    minutes < MIN_EVENT_MINUTES ||
    minutes > MAX_EVENT_HOURS * 60
  ) {
    return NextResponse.json(
      {
        error: `An event needs a valid start and an end between ${MIN_EVENT_MINUTES} minutes and ${MAX_EVENT_HOURS} hours later.`,
        code: "bad_request",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const created = await createGoogleEvent(session.userId, {
      title: data.title,
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: safeTimeZone(data.timeZone ?? request.nextUrl.searchParams.get("tz")),
      description: data.description ?? null,
      location: data.location ?? null,
      attendees: [...new Set((data.attendees ?? []).map((email) => email.trim().toLowerCase()))],
    });
    return NextResponse.json(
      { event: created.event, htmlLink: created.htmlLink },
      { status: 201, headers: NO_STORE },
    );
  } catch (cause) {
    if (cause instanceof CalendarError) {
      return NextResponse.json(
        { error: cause.message, code: cause.code },
        { status: cause.status, headers: NO_STORE },
      );
    }
    console.error("calendar write failed", cause);
    return NextResponse.json(
      { error: "The event could not be added.", code: "api_error" },
      { status: 500, headers: NO_STORE },
    );
  }
}

/** Moves one existing event to an approved time. Only start and end change. */
export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin request refused", code: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to move an event on your calendar.", code: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  if (!storageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not configured, so the calendar cannot be changed.", code: "not_configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "bad_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = moveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "That move could not be read. An event, start and end are required.",
        code: "bad_request",
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.message),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const data = parsed.data;
  if (data.mode === "demo") {
    return NextResponse.json(
      {
        error: "This is the demo calendar. Switch to your live calendar to move events.",
        code: "demo_mode",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const start = new Date(data.start);
  const end = new Date(data.end);
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    minutes < MIN_EVENT_MINUTES ||
    minutes > MAX_EVENT_HOURS * 60
  ) {
    return NextResponse.json(
      {
        error: `An event needs a valid start and an end between ${MIN_EVENT_MINUTES} minutes and ${MAX_EVENT_HOURS} hours later.`,
        code: "bad_request",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const moved = await moveGoogleEvent(session.userId, {
      eventId: data.eventId,
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: safeTimeZone(data.timeZone ?? request.nextUrl.searchParams.get("tz")),
    });
    return NextResponse.json(
      { event: moved.event, htmlLink: moved.htmlLink },
      { headers: NO_STORE },
    );
  } catch (cause) {
    if (cause instanceof CalendarError) {
      return NextResponse.json(
        { error: cause.message, code: cause.code },
        { status: cause.status, headers: NO_STORE },
      );
    }
    console.error("calendar move failed", cause);
    return NextResponse.json(
      { error: "The event could not be moved.", code: "api_error" },
      { status: 500, headers: NO_STORE },
    );
  }
}
