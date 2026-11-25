/**
 * Timezone helpers built on Intl.
 *
 * Calendar math must be done in the viewer's timezone, not the server's:
 * a 9am focus block is 9am where the user is. Every date is represented as an
 * absolute instant (Date) and formatted/derived through an IANA timezone.
 */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let cached = partsCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, cached);
  }
  return cached;
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function offsetMsAt(utcMs: number, timeZone: string): number {
  const p = zonedParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcMs;
}

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export function zonedToUtc(date: CivilDate, timeZone: string, hour = 0, minute = 0): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0);
  const firstOffset = offsetMsAt(guess, timeZone);
  let timestamp = guess - firstOffset;
  const secondOffset = offsetMsAt(timestamp, timeZone);
  if (secondOffset !== firstOffset) {
    timestamp = guess - secondOffset;
  }
  return new Date(timestamp);
}

export function civilFromParts(parts: ZonedParts): CivilDate {
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function addCivilDays(date: CivilDate, days: number): CivilDate {
  const base = new Date(Date.UTC(date.year, date.month - 1, date.day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

export function zonedMidnight(instant: Date, timeZone: string): Date {
  return zonedToUtc(civilFromParts(zonedParts(instant, timeZone)), timeZone);
}

export function addZonedDays(instant: Date, days: number, timeZone: string): Date {
  const civil = addCivilDays(civilFromParts(zonedParts(instant, timeZone)), days);
  return zonedToUtc(civil, timeZone);
}

export function zonedHour(instant: Date, hour: number, timeZone: string): Date {
  return zonedToUtc(civilFromParts(zonedParts(instant, timeZone)), timeZone, hour, 0);
}

export function formatZoned(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(date);
}

export function dateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function timeLabel(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function dayLabel(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function weekdayLong(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, { weekday: "long" });
}

export function fullDayLabel(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function clockLabel(date: Date, timeZone: string): string {
  return formatZoned(date, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace("am", "am").replace("pm", "pm");
}

/** ISO date (yyyy-mm-dd) for a civil date. */
export function isoDate(civil: CivilDate): string {
  return `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`;
}
