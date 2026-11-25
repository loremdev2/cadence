import type { SchedulingPreferences } from "./types";

/**
 * Defaults describe a normal 09:00–18:00 workday with lunch protected and a
 * ten-minute buffer between meetings. They match the behaviour of the
 * scheduling engine before preferences existed.
 */
export const DEFAULT_PREFERENCES: SchedulingPreferences = {
  workdayStart: 9,
  workdayEnd: 18,
  lunchStart: 12,
  lunchEnd: 13,
  bufferMinutes: 10,
  focusBlockMinutes: 90,
  preferMornings: true,
  protectLunch: true,
  allowWeekends: false,
};

export const PREFERENCES_STORAGE_KEY = "cadence.preferences.v1";

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

/** Coerces anything (stored JSON, request body) into a usable rule set. */
export function normalizePreferences(input: unknown): SchedulingPreferences {
  const raw = (input ?? {}) as Partial<Record<keyof SchedulingPreferences, unknown>>;
  const start = clampInt(
    raw.workdayStart,
    0,
    22,
    DEFAULT_PREFERENCES.workdayStart,
  );
  const end = clampInt(raw.workdayEnd, start + 2, 24, DEFAULT_PREFERENCES.workdayEnd);
  const lunchStart = clampInt(raw.lunchStart, start, end - 1, DEFAULT_PREFERENCES.lunchStart);
  const lunchEnd = clampInt(
    raw.lunchEnd,
    lunchStart + 1,
    end,
    Math.min(end, Math.max(lunchStart + 1, DEFAULT_PREFERENCES.lunchEnd)),
  );

  return {
    workdayStart: start,
    workdayEnd: end,
    lunchStart: Math.min(lunchStart, end - 1),
    lunchEnd,
    bufferMinutes: clampInt(raw.bufferMinutes, 0, 60, DEFAULT_PREFERENCES.bufferMinutes),
    focusBlockMinutes: clampInt(
      raw.focusBlockMinutes,
      30,
      240,
      DEFAULT_PREFERENCES.focusBlockMinutes,
    ),
    preferMornings: bool(raw.preferMornings, DEFAULT_PREFERENCES.preferMornings),
    protectLunch: bool(raw.protectLunch, DEFAULT_PREFERENCES.protectLunch),
    allowWeekends: bool(raw.allowWeekends, DEFAULT_PREFERENCES.allowWeekends),
  };
}

/** Browser-only: preferences live with the user, not in the database. */
export function loadPreferences(): SchedulingPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    return normalizePreferences(JSON.parse(stored));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: SchedulingPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizePreferences(preferences)),
    );
  } catch {
    // Private mode or a full quota: the defaults still apply next load.
  }
}

export function workdayLabel(preferences: SchedulingPreferences) {
  const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  return `${clock(preferences.workdayStart)}–${clock(preferences.workdayEnd)}`;
}
