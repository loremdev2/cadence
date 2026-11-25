import { getAdminClient } from "../supabase/admin";
import { decryptSecret, encryptSecret } from "../crypto";
import type { Attendee, CalEvent, EventCategory } from "../types";
import {
  exchangeRefreshToken,
  GoogleAuthError,
  hasCalendarScope,
  hasCalendarWriteScope,
} from "./oauth";

export type CalendarErrorCode =
  | "not_configured"
  | "not_connected"
  | "needs_reconnect"
  | "scope_missing"
  | "rate_limited"
  | "api_error";

export class CalendarError extends Error {
  code: CalendarErrorCode;
  status: number;

  constructor(code: CalendarErrorCode, message: string, status = 400) {
    super(message);
    this.name = "CalendarError";
    this.code = code;
    this.status = status;
  }
}

interface ConnectionRow {
  user_id: string;
  google_email: string | null;
  scopes: string[] | null;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  status: string | null;
}

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function loadConnection(userId: string): Promise<ConnectionRow> {
  const admin = getAdminClient();
  if (!admin) {
    throw new CalendarError(
      "not_configured",
      "Supabase is not configured, so stored calendar connections are unavailable.",
      503,
    );
  }
  const { data, error } = await admin
    .from("calendar_connections")
    .select(
      "user_id, google_email, scopes, refresh_token_enc, access_token_enc, access_token_expires_at, status",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new CalendarError("api_error", `Could not read the calendar connection: ${error.message}`, 500);
  }
  if (!data) {
    throw new CalendarError("not_connected", "No Google Calendar connection for this account.", 409);
  }
  return data as ConnectionRow;
}

async function markStatus(userId: string, status: string, lastError: string | null, clearTokens = false) {
  const admin = getAdminClient();
  if (!admin) return;
  await admin
    .from("calendar_connections")
    .update({
      status,
      last_error: lastError,
      updated_at: new Date().toISOString(),
      ...(clearTokens
        ? { access_token_enc: null, access_token_expires_at: null, refresh_token_enc: null }
        : {}),
    })
    .eq("user_id", userId);
}

async function getAccessToken(
  connection: ConnectionRow,
  options: { write?: boolean } = {},
): Promise<string> {
  const scopes = connection.scopes ?? [];
  if (connection.status === "revoked" || connection.status === "missing_scope") {
    throw new CalendarError(
      "needs_reconnect",
      connection.status === "missing_scope"
        ? "Google Calendar permission was not granted. Reconnect and approve calendar access."
        : "Google has revoked access. Reconnect your calendar.",
      409,
    );
  }
  if (scopes.length > 0 && !hasCalendarScope(scopes)) {
    throw new CalendarError(
      "scope_missing",
      "The stored Google grant does not include Calendar event access. Reconnect to approve it.",
      409,
    );
  }
  if (options.write && scopes.length > 0 && !hasCalendarWriteScope(scopes)) {
    throw new CalendarError(
      "scope_missing",
      "This connection is read-only. Reconnect and approve write access to add events.",
      409,
    );
  }
  if (!connection.refresh_token_enc) {
    throw new CalendarError(
      "not_connected",
      "No refresh token is stored. Reconnect Google Calendar so Cadence can refresh access.",
      409,
    );
  }

  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0;

  if (connection.access_token_enc && expiresAt > Date.now() + 60_000) {
    try {
      return decryptSecret(connection.access_token_enc);
    } catch {
      // Fall through and refresh with the stored refresh token.
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refresh_token_enc);
  } catch {
    await markStatus(connection.user_id, "revoked", "Stored refresh token could not be decrypted.", true);
    throw new CalendarError(
      "needs_reconnect",
      "The stored calendar credential could not be read. Reconnect your calendar.",
      409,
    );
  }

  try {
    const refreshed = await exchangeRefreshToken(refreshToken);
    const admin = getAdminClient();
    if (admin) {
      await admin
        .from("calendar_connections")
        .update({
          access_token_enc: encryptSecret(refreshed.accessToken),
          access_token_expires_at: new Date(
            Date.now() + Math.max(60, refreshed.expiresInSeconds - 120) * 1000,
          ).toISOString(),
          status: "connected",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", connection.user_id);
    }
    return refreshed.accessToken;
  } catch (error) {
    if (error instanceof GoogleAuthError && error.code === "invalid_grant") {
      await markStatus(connection.user_id, "revoked", error.message, true);
      throw new CalendarError("needs_reconnect", error.message, 409);
    }
    const message = error instanceof Error ? error.message : "Google token refresh failed.";
    await markStatus(connection.user_id, "error", message);
    throw new CalendarError("api_error", message, 502);
  }
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  recurringEventId?: string;
  recurrence?: string[];
  organizer?: { email?: string; displayName?: string };
  attendees?: {
    email?: string;
    displayName?: string;
    self?: boolean;
    responseStatus?: string;
    organizer?: boolean;
  }[];
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
}

const FOCUS_PATTERN = /(focus|deep work|heads[- ]down|no meetings|writing time|do not book)/i;

function categorize(title: string, description: string, attendees: Attendee[], ownerEmail: string | null): EventCategory {
  const text = `${title} ${description}`;
  if (FOCUS_PATTERN.test(text)) return "focus";
  if (attendees.length === 0) return "personal";
  const ownerDomain = ownerEmail?.split("@")[1]?.toLowerCase();
  const external = attendees.some((attendee) => {
    const domain = attendee.email?.split("@")[1]?.toLowerCase();
    return Boolean(domain && ownerDomain && domain !== ownerDomain);
  });
  return external ? "meeting" : "internal";
}

function mapEvent(event: GoogleEvent, ownerEmail: string | null): CalEvent | null {
  if (!event.start || !event.end) return null;
  const allDay = Boolean(event.start.date);
  const start = event.start.dateTime ?? event.start.date;
  const end = event.end.dateTime ?? event.end.date;
  if (!start || !end) return null;

  const attendees: Attendee[] = (event.attendees ?? []).map((attendee) => ({
    email: attendee.email,
    name: attendee.displayName,
    self: attendee.self,
    responseStatus: attendee.responseStatus,
    organizer: attendee.organizer,
  }));

  const title = event.summary?.trim() || "(No title)";
  const description = event.description?.slice(0, 4000);

  return {
    id: event.id,
    title,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    allDay,
    description,
    location: event.location,
    attendees,
    organizer: event.organizer?.email,
    category: categorize(title, description ?? "", attendees, ownerEmail),
    recurring: Boolean(event.recurringEventId || event.recurrence?.length),
    htmlLink: event.htmlLink,
    hangoutLink: event.hangoutLink,
    status: event.status ?? "confirmed",
  };
}

export interface GoogleEventsResult {
  events: CalEvent[];
  timeZone: string | null;
  calendarEmail: string | null;
}

export async function listGoogleEvents(
  userId: string,
  rangeStartISO: string,
  rangeEndISO: string,
): Promise<GoogleEventsResult> {
  const connection = await loadConnection(userId);
  const accessToken = await getAccessToken(connection);

  const start = new Date(rangeStartISO);
  const end = new Date(rangeEndISO);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new CalendarError("api_error", "Invalid date range.", 400);
  }
  // Cap the window so a stray query cannot pull a whole year.
  const cappedEnd = new Date(Math.min(end.getTime(), start.getTime() + 62 * 86_400_000));

  const events: CalEvent[] = [];
  let pageToken: string | undefined;
  let timeZone: string | null = null;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: cappedEnd.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${CALENDAR_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (response.status === 401) {
      await markStatus(userId, "error", "Google rejected the access token (401).");
      throw new CalendarError("needs_reconnect", "Google rejected the calendar token. Reconnect your calendar.", 409);
    }
    if (response.status === 403) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = body?.error?.message ?? "Google Calendar API returned 403.";
      if (/rateLimitExceeded|quotaExceeded|userRateLimitExceeded/i.test(message)) {
        throw new CalendarError("rate_limited", "Google Calendar rate limit reached. Try again shortly.", 429);
      }
      await markStatus(userId, "error", message);
      throw new CalendarError("scope_missing", `Google Calendar refused the request: ${message}`, 403);
    }
    if (!response.ok) {
      const message = `Google Calendar API error (${response.status}).`;
      await markStatus(userId, "error", message);
      throw new CalendarError("api_error", message, 502);
    }

    const payload = (await response.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      timeZone?: string;
    };
    timeZone = payload.timeZone ?? timeZone;

    for (const item of payload.items ?? []) {
      const mapped = mapEvent(item, connection.google_email);
      if (mapped && mapped.status !== "cancelled") events.push(mapped);
    }

    pageToken = payload.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 6);

  return {
    events,
    timeZone,
    calendarEmail: connection.google_email,
  };
}

/**
 * Google expects wall-clock time plus an explicit zone for inserts. Sending a
 * `Z` timestamp together with a named zone makes the event's local time
 * ambiguous, so the instant is re-rendered in the viewer's zone first.
 */
function wallClock(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`;
  } catch {
    return date.toISOString();
  }
}

export interface CreateEventInput {
  title: string;
  start: string;
  end: string;
  timeZone: string;
  description?: string | null;
}

export interface CreatedEvent {
  event: CalEvent;
  htmlLink: string | null;
}

/**
 * Inserts an event on the viewer's primary calendar. No attendees are sent and
 * Google is told not to mail anyone, so this is a silent write to the owner's
 * own calendar rather than an invitation.
 */
export async function createGoogleEvent(
  userId: string,
  input: CreateEventInput,
): Promise<CreatedEvent> {
  const connection = await loadConnection(userId);
  const accessToken = await getAccessToken(connection, { write: true });

  const start = new Date(input.start);
  const end = new Date(input.end);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    throw new CalendarError("api_error", "The new event needs a valid start and end.", 400);
  }

  const response = await fetch(`${CALENDAR_API}?sendUpdates=none`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.title,
      ...(input.description ? { description: input.description } : {}),
      start: { dateTime: wallClock(input.start, input.timeZone), timeZone: input.timeZone },
      end: { dateTime: wallClock(input.end, input.timeZone), timeZone: input.timeZone },
    }),
    cache: "no-store",
  });

  if (response.status === 401) {
    await markStatus(userId, "error", "Google rejected the access token (401).");
    throw new CalendarError(
      "needs_reconnect",
      "Google rejected the calendar token. Reconnect your calendar.",
      409,
    );
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const message = body?.error?.message ?? "Google Calendar API returned 403.";
    if (/rateLimitExceeded|quotaExceeded|userRateLimitExceeded/i.test(message)) {
      throw new CalendarError("rate_limited", "Google Calendar rate limit reached. Try again shortly.", 429);
    }
    await markStatus(userId, "error", message);
    throw new CalendarError(
      "scope_missing",
      "Google refused to add the event. Reconnect the calendar and approve write access.",
      403,
    );
  }
  if (!response.ok) {
    const message = `Google Calendar API error (${response.status}).`;
    await markStatus(userId, "error", message);
    throw new CalendarError("api_error", message, 502);
  }

  const payload = (await response.json()) as GoogleEvent;
  const event = mapEvent(payload, connection.google_email);
  if (!event) {
    throw new CalendarError(
      "api_error",
      "Google added the event but did not return its details.",
      502,
    );
  }

  return { event, htmlLink: payload.htmlLink ?? null };
}
