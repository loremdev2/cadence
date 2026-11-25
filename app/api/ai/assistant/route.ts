import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { aiConfigured, runAssistant, type AssistantIntent } from "@/lib/ai/assistant";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { normalizePreferences } from "@/lib/preferences";
import { getSession } from "@/lib/session";
import type { CalEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const attendeeSchema = z.object({
  email: z.string().max(320).nullish(),
  name: z.string().max(200).nullish(),
  self: z.boolean().nullish(),
  responseStatus: z.string().max(40).nullish(),
  organizer: z.boolean().nullish(),
});

const eventSchema = z.object({
  id: z.string().min(1).max(400),
  title: z.string().max(500),
  start: z.string().max(60),
  end: z.string().max(60),
  allDay: z.boolean().optional(),
  description: z.string().max(6000).nullish(),
  location: z.string().max(500).nullish(),
  category: z.enum(["meeting", "internal", "focus", "personal"]).optional(),
  recurring: z.boolean().nullish(),
  organizer: z.string().max(320).nullish(),
  htmlLink: z.string().max(2000).nullish(),
  hangoutLink: z.string().max(2000).nullish(),
  status: z.string().max(40).nullish(),
  attendees: z.array(attendeeSchema).max(120).nullish(),
});

const preferencesSchema = z
  .object({
    workdayStart: z.number().optional(),
    workdayEnd: z.number().optional(),
    lunchStart: z.number().optional(),
    lunchEnd: z.number().optional(),
    bufferMinutes: z.number().optional(),
    focusBlockMinutes: z.number().optional(),
    preferMornings: z.boolean().optional(),
    protectLunch: z.boolean().optional(),
    allowWeekends: z.boolean().optional(),
  })
  .nullish();

const eventDraftSchema = z
  .object({
    title: z.string().min(1).max(200),
    agenda: z.string().max(5000).optional(),
    description: z.string().max(5000).optional(),
    location: z.string().max(500).optional(),
    attendees: z.array(z.string().email().max(320)).max(100).optional(),
    requestedDate: z.string().max(20).nullish(),
    requestedPeriod: z.enum(["morning", "afternoon", "evening"]).nullish(),
    start: z.string().max(60).nullish(),
    durationMinutes: z.number().int().min(5).max(720).nullish(),
  })
  .nullish();

const bodySchema = z.object({
  prompt: z.string().min(1).max(800),
  mode: z.enum(["demo", "live"]),
  timeZone: z.string().max(80).optional(),
  view: z.object({ start: z.string().max(60), end: z.string().max(60) }),
  events: z.array(eventSchema).max(400),
  eventId: z.string().max(400).nullish(),
  intent: z
    .enum([
      "find_time",
      "brief",
      "conflicts",
      "overview",
      "week_plan",
      "reschedule",
      "create_event",
    ])
    .nullish(),
  preferences: preferencesSchema,
  eventDraft: eventDraftSchema,
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "bad_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "That request could not be read.",
        code: "bad_request",
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.message),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const data = parsed.data;

  if (aiConfigured()) {
    const session = await getSession();
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const requesterIp = request.headers.get("x-real-ip")?.trim() || forwardedFor || "anonymous";
    const principal = session?.userId ? `user:${session.userId}` : `ip:${requesterIp}`;
    const limit = await checkAiRateLimit(principal);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Cadence has reached its AI request limit. Please wait a bit and try again.",
          code: "rate_limited",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }
  }

  const events: CalEvent[] = data.events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: Boolean(event.allDay),
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    category: event.category ?? "internal",
    recurring: event.recurring ?? undefined,
    organizer: event.organizer ?? undefined,
    htmlLink: event.htmlLink ?? undefined,
    hangoutLink: event.hangoutLink ?? undefined,
    status: event.status ?? undefined,
    attendees: (event.attendees ?? []).map((attendee) => ({
      email: attendee.email ?? undefined,
      name: attendee.name ?? undefined,
      self: attendee.self ?? undefined,
      responseStatus: attendee.responseStatus ?? undefined,
      organizer: attendee.organizer ?? undefined,
    })),
  }));

  try {
    const result = await runAssistant({
      prompt: data.prompt,
      events,
      range: data.view,
      timeZone: data.timeZone ?? "UTC",
      mode: data.mode,
      eventId: data.eventId ?? null,
      forceIntent: (data.intent ?? null) as AssistantIntent | null,
      preferences: data.preferences ? normalizePreferences(data.preferences) : null,
      eventDraft: data.eventDraft ?? null,
    });

    return NextResponse.json(result, { headers: NO_STORE });
  } catch (cause) {
    console.error("assistant failed", cause);
    return NextResponse.json(
      {
        error:
          "The assistant could not answer that. Try a shorter request or pick a meeting first.",
        code: "assistant_error",
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
