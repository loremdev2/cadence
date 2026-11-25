import type {
  AiConflict,
  AiSlot,
  CalEvent,
  CalendarRange,
  WeekStats,
} from "./types";
import {
  addZonedDays,
  clockLabel,
  dateKey,
  dayLabel,
  fullDayLabel,
  timeLabel,
  weekdayLong,
  zonedHour,
  zonedMidnight,
} from "./timezone";

export const WORKDAY_START_HOUR = 9;
export const WORKDAY_END_HOUR = 18;
export const LUNCH_START_HOUR = 12;
export const LUNCH_END_HOUR = 13;
const MIN_BUFFER_MINUTES = 10;

export interface SlotOptions {
  range: CalendarRange;
  durationMinutes: number;
  timeZone: string;
  avoidLunch?: boolean;
  preferMornings?: boolean;
  limit?: number;
  now?: Date;
}

interface Interval {
  start: number;
  end: number;
}

function toInterval(event: CalEvent): Interval | null {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function busyIntervals(events: CalEvent[]): Interval[] {
  return events
    .filter((event) => event.status !== "cancelled")
    .map(toInterval)
    .filter((value): value is Interval => value !== null)
    .sort((a, b) => a.start - b.start);
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

export function timedEvents(events: CalEvent[]): CalEvent[] {
  return events.filter((event) => !event.allDay && event.status !== "cancelled");
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function findOpenSlots(events: CalEvent[], options: SlotOptions): AiSlot[] {
  const {
    range,
    durationMinutes,
    timeZone,
    avoidLunch = true,
    preferMornings = true,
    limit = 4,
    now = new Date(),
  } = options;

  const rangeStart = new Date(range.start);
  const rangeEnd = new Date(range.end);
  if (
    !Number.isFinite(rangeStart.getTime()) ||
    !Number.isFinite(rangeEnd.getTime()) ||
    rangeEnd <= rangeStart
  ) {
    return [];
  }

  const busy = mergeIntervals(busyIntervals(events));
  const slots: AiSlot[] = [];
  const durationMs = durationMinutes * 60_000;

  let dayCursor = zonedMidnight(rangeStart, timeZone);
  let guard = 0;

  while (dayCursor.getTime() < rangeEnd.getTime() && guard < 62) {
    guard += 1;
    const dayStart = zonedHour(dayCursor, WORKDAY_START_HOUR, timeZone);
    const dayEnd = zonedHour(dayCursor, WORKDAY_END_HOUR, timeZone);
    const windowStart = Math.max(
      dayStart.getTime(),
      rangeStart.getTime(),
      now.getTime() + 5 * 60_000,
    );
    const windowEnd = Math.min(dayEnd.getTime(), rangeEnd.getTime());

    if (windowEnd - windowStart >= durationMs) {
      const dayBusy = busy.filter(
        (interval) => interval.end > windowStart && interval.start < windowEnd,
      );
      let cursor = windowStart;
      for (const interval of dayBusy) {
        if (interval.start - cursor >= durationMs) {
          pushSlot(cursor, interval.start);
        }
        cursor = Math.max(cursor, interval.end);
      }
      if (windowEnd - cursor >= durationMs) {
        pushSlot(cursor, windowEnd);
      }
    }

    dayCursor = addZonedDays(dayCursor, 1, timeZone);
  }

  function pushSlot(gapStart: number, gapEnd: number) {
    const gapMinutes = Math.floor((gapEnd - gapStart) / 60_000);
    if (gapMinutes < durationMinutes) return;
    if (slots.length >= limit * 6) return;

    const start = new Date(gapStart);
    let end = new Date(gapStart + durationMs);

    if (avoidLunch) {
      const lunchStart = zonedHour(start, LUNCH_START_HOUR, timeZone).getTime();
      const lunchEnd = zonedHour(start, LUNCH_END_HOUR, timeZone).getTime();
      if (start.getTime() < lunchEnd && end.getTime() > lunchStart) {
        const afterLunch = lunchEnd;
        if (gapEnd - afterLunch >= durationMs) {
          return pushSlot(afterLunch, gapEnd);
        }
        return;
      }
    }

    const startHour = Number(timeLabel(start, timeZone).slice(0, 2));
    const weekdayKey = dateKey(start, timeZone);
    const weekday = new Date(`${weekdayKey}T12:00:00Z`).getUTCDay();

    const reasons: string[] = [];
    let score = 48;

    const prevEnd = busy
      .filter((interval) => interval.end <= gapStart)
      .reduce((max, interval) => Math.max(max, interval.end), 0);
    const nextStart = busy
      .filter((interval) => interval.start >= gapEnd)
      .reduce((min, interval) => Math.min(min, interval.start), Number.POSITIVE_INFINITY);

    if (gapMinutes >= durationMinutes + 30) {
      score += 10;
      reasons.push(`${durationLabel(gapMinutes - durationMinutes)} of slack around it`);
    }
    if (prevEnd && (gapStart - prevEnd) / 60_000 >= MIN_BUFFER_MINUTES) {
      score += 8;
    }
    if (Number.isFinite(nextStart) && (nextStart - gapEnd) / 60_000 >= MIN_BUFFER_MINUTES) {
      score += 8;
      reasons.push("a clean hand-off to the next meeting");
    }
    if (startHour < 12) {
      score += preferMornings ? 18 : 8;
      reasons.push("morning block, when the day is usually calmest");
    }
    if (startHour >= 14 && startHour < 17) {
      score += 5;
      reasons.push("an afternoon block that does not split the day");
    }
    if (weekday === 5 && startHour >= 15) {
      score -= 22;
      reasons.push("Friday afternoon, so it is easy to lose");
    }
    if (weekday === 0 || weekday === 6) {
      // Business context: weekends are available but should not outrank a
      // weekday opening unless that is all there is.
      score -= 24;
    }
    if (weekday === 1) score += 4;
    if (gapMinutes >= durationMinutes * 2) score += 4;

    if (reasons.length === 0) {
      reasons.push("the only clean window of that length");
    }

    end = new Date(gapStart + durationMs);
    slots.push({
      start: start.toISOString(),
      end: end.toISOString(),
      minutes: durationMinutes,
      dayLabel: dayLabel(start, timeZone),
      timeLabel: `${timeLabel(start, timeZone)} – ${timeLabel(end, timeZone)}`,
      score: Math.min(98, Math.max(20, Math.round(score))),
      reasons: reasons.slice(0, 2),
    });
  }

  return slots
    .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))
    .slice(0, limit);
}

function shortRange(event: CalEvent, timeZone: string) {
  return `${timeLabel(new Date(event.start), timeZone)}–${timeLabel(new Date(event.end), timeZone)}`;
}

export function detectConflicts(events: CalEvent[], timeZone: string): AiConflict[] {
  const conflicts: AiConflict[] = [];
  const active = events.filter((event) => event.status !== "cancelled");
  const days = new Map<string, CalEvent[]>();

  for (const event of active) {
    const key = dateKey(new Date(event.start), timeZone);
    const list = days.get(key) ?? [];
    list.push(event);
    days.set(key, list);
  }

  for (const [, dayEvents] of days) {
    const timed = dayEvents
      .filter((event) => !event.allDay)
      .sort((a, b) => a.start.localeCompare(b.start));
    const anchor = timed[0] ? new Date(timed[0].start) : new Date(dayEvents[0].start);

    for (let i = 0; i < timed.length; i += 1) {
      for (let j = i + 1; j < timed.length; j += 1) {
        const a = timed[i];
        const b = timed[j];
        const aStart = new Date(a.start).getTime();
        const aEnd = new Date(a.end).getTime();
        const bStart = new Date(b.start).getTime();
        const bEnd = new Date(b.end).getTime();

        if (aStart < bEnd && bStart < aEnd) {
          const overlapMinutes = Math.round(
            (Math.min(aEnd, bEnd) - Math.max(aStart, bStart)) / 60_000,
          );
          const shorter = aEnd - aStart <= bEnd - bStart ? a : b;
          const longer = shorter === a ? b : a;
          conflicts.push({
            id: `overlap-${a.id}-${b.id}`,
            severity: overlapMinutes >= 30 ? "high" : "medium",
            type: "overlap",
            title: `“${a.title}” overlaps “${b.title}”`,
            detail: `${overlapMinutes} minutes double-booked on ${fullDayLabel(new Date(a.start), timeZone)} (${shortRange(a, timeZone)} and ${shortRange(b, timeZone)}).`,
            suggestion: `Keep “${longer.title}” where it is and move “${shorter.title}” to a free slot, or send the shorter meeting an updated time.`,
            eventIds: [a.id, b.id],
          });
        } else {
          const gap = Math.round((bStart - aEnd) / 60_000);
          if (gap >= 0 && gap < MIN_BUFFER_MINUTES) {
            conflicts.push({
              id: `b2b-${a.id}-${b.id}`,
              severity: "low",
              type: "back_to_back",
              title: `No breathing room before “${b.title}”`,
              detail: `“${a.title}” ends at ${timeLabel(new Date(a.end), timeZone)} and “${b.title}” starts at ${timeLabel(new Date(b.start), timeZone)} on ${weekdayLong(new Date(b.start), timeZone)}.`,
              suggestion: `Add a ten-minute buffer, or end “${a.title}” five minutes early so the next call does not start late.`,
              eventIds: [a.id, b.id],
            });
          }
        }
      }
    }

    const meetingMinutes = timed.reduce(
      (total, event) =>
        total + (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000,
      0,
    );
    if (meetingMinutes > 240) {
      conflicts.push({
        id: `overloaded-${dateKey(anchor, timeZone)}`,
        severity: meetingMinutes > 330 ? "high" : "medium",
        type: "overloaded",
        title: `${Math.round(meetingMinutes / 60)}h of meetings on ${weekdayLong(anchor, timeZone)}`,
        detail: `${timed.length} meetings booked. Little room is left for the work those meetings create.`,
        suggestion:
          "Move one internal meeting to an open morning slot, or shorten the two longest by fifteen minutes each.",
        eventIds: timed.map((event) => event.id),
      });
    }

    const lunchStart = zonedHour(anchor, LUNCH_START_HOUR, timeZone).getTime();
    const lunchEnd = zonedHour(anchor, LUNCH_END_HOUR, timeZone).getTime();
    const workStart = zonedHour(anchor, WORKDAY_START_HOUR, timeZone).getTime();
    const workEnd = zonedHour(anchor, WORKDAY_END_HOUR, timeZone).getTime();

    const gaps: number[] = [];
    let cursor = workStart;
    for (const event of timed) {
      const start = new Date(event.start).getTime();
      const end = new Date(event.end).getTime();
      if (start > cursor) gaps.push((start - cursor) / 60_000);
      cursor = Math.max(cursor, end);
    }
    if (cursor < workEnd) gaps.push((workEnd - cursor) / 60_000);
    const longestGap = gaps.length ? Math.max(...gaps) : 0;
    const lunchBlocked = timed.some(
      (event) =>
        new Date(event.start).getTime() < lunchEnd &&
        new Date(event.end).getTime() > lunchStart,
    );

    if (timed.length >= 3 && longestGap < 60) {
      conflicts.push({
        id: `no-focus-${dateKey(anchor, timeZone)}`,
        severity: "medium",
        type: "no_focus",
        title: `No focus block on ${weekdayLong(anchor, timeZone)}`,
        detail: `The longest uninterrupted window is ${Math.round(longestGap)} minutes${lunchBlocked ? ", and lunch is booked over" : ""}.`,
        suggestion:
          "Protect one sixty-minute window in the morning and decline or delegate the least critical meeting that sits in it.",
        eventIds: timed.map((event) => event.id),
      });
    }

    for (const event of timed) {
      const startHour = Number(timeLabel(new Date(event.start), timeZone).slice(0, 2));
      const endClock = timeLabel(new Date(event.end), timeZone);
      const endHour = Number(endClock.slice(0, 2)) + (endClock.slice(3) === "00" ? 0 : 1);
      if (startHour < 8 || endHour > 19) {
        conflicts.push({
          id: `hours-${event.id}`,
          severity: "low",
          type: "outside_hours",
          title: `“${event.title}” sits outside working hours`,
          detail: `${shortRange(event, timeZone)} on ${weekdayLong(new Date(event.start), timeZone)} is outside the 09:00–18:00 window.`,
          suggestion: "Ask for a daytime slot, or make it async if the agenda allows.",
          eventIds: [event.id],
        });
      }
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return conflicts
    .sort((a, b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title))
    .slice(0, 8);
}

export function inRange(event: CalEvent, range: CalendarRange) {
  return (
    new Date(event.start).getTime() < new Date(range.end).getTime() &&
    new Date(event.end).getTime() > new Date(range.start).getTime()
  );
}

export function computeWeekStats(
  events: CalEvent[],
  range: CalendarRange,
  timeZone: string,
): WeekStats {
  const active = events.filter((event) => event.status !== "cancelled" && inRange(event, range));
  const meetings = active.filter((event) => !event.allDay && event.category !== "focus");
  const focus = active.filter((event) => event.category === "focus");

  const totalMinutes = (list: CalEvent[]) =>
    list.reduce(
      (sum, event) =>
        sum + (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000,
      0,
    );

  const byDay = new Map<string, number>();
  for (const event of meetings) {
    const key = weekdayLong(new Date(event.start), timeZone);
    byDay.set(
      key,
      (byDay.get(key) ?? 0) +
        (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000,
    );
  }
  let busiestDay: string | null = null;
  let busiest = 0;
  for (const [day, minutes] of byDay) {
    if (minutes > busiest) {
      busiest = minutes;
      busiestDay = day;
    }
  }

  const conflicts = detectConflicts(active, timeZone).filter(
    (conflict) => conflict.severity !== "low",
  );

  return {
    meetingHours: Math.round((totalMinutes(meetings) / 60) * 10) / 10,
    meetingCount: meetings.length,
    focusHours: Math.round((totalMinutes(focus) / 60) * 10) / 10,
    conflicts: conflicts.length,
    busiestDay,
  };
}

export function nextEvent(events: CalEvent[], from = new Date()): CalEvent | null {
  return (
    events
      .filter((event) => !event.allDay && new Date(event.end) > from)
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null
  );
}

export function eventClockRange(event: CalEvent, timeZone: string) {
  return `${clockLabel(new Date(event.start), timeZone)} – ${clockLabel(new Date(event.end), timeZone)}`;
}
