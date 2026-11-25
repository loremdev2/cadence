import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
  computeWeekStats,
  detectConflicts,
  findOpenSlots,
  inRange,
  nextEvent,
} from "../scheduling";
import {
  addCivilDays,
  civilFromParts,
  dayLabel,
  fullDayLabel,
  isoDate,
  safeTimeZone,
  timeLabel,
  weekdayLong,
  zonedParts,
  zonedToUtc,
} from "../timezone";
import { normalizePreferences } from "../preferences";
import type {
  AiConflict,
  AssistantIntent,
  AssistantResult,
  BriefItem,
  BriefSection,
  BriefSource,
  CalEvent,
  CalendarMode,
  CalendarRange,
  EventDraft,
  RescheduleOption,
  SchedulingPreferences,
} from "../types";

export type { AssistantIntent };

// Sole switch for the model: set OPENROUTER_MODEL and both the interpretation
// call and the narration call use that id. Tolerates quotes and stray spaces,
// which .env files often pick up from copy-paste.
function envModelId() {
  return (process.env.OPENROUTER_MODEL ?? "")
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
}

// A free model keeps the demo runnable without credits. It must support
// structured outputs, because the interpretation step is a JSON schema call.
export const AI_MODEL = envModelId() || "particle-ai/particle-1:free";

/**
 * Free endpoints share one rate-limited pool, so a `:free` request can come
 * back 429 while the next model is idle. OpenRouter walks this list in order
 * when the primary fails. All entries accept reasoning being switched off and
 * support structured outputs.
 */
const FREE_MODEL_FALLBACKS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3.5-lightning:free",
];

/**
 * Free OpenRouter endpoints are mostly reasoning models. Left on, they spend
 * the whole token budget on hidden reasoning and return empty content, so
 * reasoning is disabled for `:free` models only. Paid models keep their
 * default behaviour.
 */
function providerOptions() {
  if (!AI_MODEL.endsWith(":free")) return undefined;
  return {
    openrouter: {
      reasoning: { enabled: false },
      models: FREE_MODEL_FALLBACKS.filter((id) => id !== AI_MODEL),
    },
  };
}

export function aiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export interface AssistantInput {
  prompt: string;
  events: CalEvent[];
  range: CalendarRange;
  timeZone: string;
  mode: CalendarMode;
  eventId?: string | null;
  forceIntent?: AssistantIntent | null;
  preferences?: SchedulingPreferences | null;
  eventDraft?: {
    title: string;
    agenda?: string;
    description?: string;
    location?: string;
    attendees?: string[];
    requestedDate?: string | null;
    requestedPeriod?: "morning" | "afternoon" | "evening" | null;
    start?: string | null;
    durationMinutes?: number | null;
  } | null;
  now?: Date;
}

interface Interpretation {
  intent: AssistantIntent;
  durationMinutes: number | null;
  searchStart: string | null;
  searchEnd: string | null;
  searchEndInclusive: boolean;
  avoidLunch: boolean;
  preferMornings: boolean;
  avoidMornings: boolean;
  eventId: string | null;
  eventTitle: string | null;
  requestedDate: string | null;
  requestedPeriod: "morning" | "afternoon" | "evening" | null;
  requestedStart: string | null;
}

let provider: ReturnType<typeof createOpenRouter> | null = null;

function getModel() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  if (!provider) provider = createOpenRouter({ apiKey: key });
  return provider(AI_MODEL);
}

const WEEKDAY_WORDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanModelText(text: string) {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s*—\s*/g, " — ")
    .trim()
    .slice(0, 1200);
}

function parseCivil(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function weekdayIndexFromPrompt(prompt: string, prefixPattern: string) {
  const weekdayPattern =
    "sunday|monday|tues(?:day)?|wed(?:nesday)?|thursday|thursay|thurday|thrusday|thur|thu|friday|saturday";
  const pattern = new RegExp(
    `\\b(?:${prefixPattern})\\s+(?:next\\s+)?(${weekdayPattern})\\b`,
    "i",
  );
  const match = pattern.exec(prompt);
  if (!match) return null;
  const day = match[1].toLowerCase();
  if (day.startsWith("tues")) return 2;
  if (day.startsWith("wed")) return 3;
  if (day.startsWith("thu")) return 4;
  return WEEKDAY_WORDS.indexOf(day as (typeof WEEKDAY_WORDS)[number]);
}

function requestedClock(prompt: string) {
  const twelveHour = /\b(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(prompt);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3].toLowerCase().startsWith("p")) hour += 12;
    return { hour, minute: Number(twelveHour[2] ?? 0) };
  }
  const twentyFourHour = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/.exec(prompt);
  return twentyFourHour
    ? { hour: Number(twentyFourHour[1]), minute: Number(twentyFourHour[2]) }
    : null;
}

function requestedEventTitle(prompt: string) {
  const match = /\b(?:schedule|book|create|add|set\s+up)\s+(?:(?:a|an|the)\s+)?(.+?)(?=\s+(?:on|at|for|today|tomorrow|monday|tuesday|wednesday|thursday|thursay|friday|saturday|sunday|next\s+(?:monday|tuesday|wednesday|thursday|thursay|friday|saturday|sunday))\b|$)/i.exec(
    prompt,
  );
  const title = match?.[1]?.trim().replace(/[.,!?]+$/, "");
  if (!title || /^(?:it|this|that|something)$/i.test(title)) return "Meeting";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function nextCivilForWeekday(
  weekday: number,
  today: { year: number; month: number; day: number },
  todayDow: number,
  allowToday: boolean,
) {
  let delta = (weekday - todayDow + 7) % 7;
  if (delta === 0 && !allowToday) delta = 7;
  return addCivilDays(today, delta);
}

function heuristicInterpret(input: AssistantInput, now: Date): Interpretation {
  const prompt = input.prompt.toLowerCase();
  const tz = safeTimeZone(input.timeZone);

  let intent: AssistantIntent = input.forceIntent ?? "overview";
  if (!input.forceIntent) {
    if (/\b(schedule|book|create|add|set up)\b/i.test(prompt) && /\b(meeting|call|event|appointment|interview|session)\b/i.test(prompt)) {
      intent = "create_event";
    } else if (
      /(conflict|overlap|double[- ]?book|back[- ]to[- ]back|schedule health|too many meetings|clash)/.test(
        prompt,
      )
    ) {
      intent = "conflicts";
    } else if (
      /(summar(y|ise|ize).*(week|day|schedule|calendar)|how (does|is) my (week|day|calendar)|week at a glance)/.test(
        prompt,
      )
    ) {
      intent = "overview";
    } else if (
      /(prep|prepare|brief|catch me up|what('s| is) .* about|background|talking points|agenda for)/.test(
        prompt,
      )
    ) {
      intent = "brief";
    } else if (
      /(plan (?:my|the|this) week|weekly plan|week plan|map (?:my|the) week)/.test(prompt)
    ) {
      intent = "week_plan";
    } else if (
      input.eventId &&
      /(what if|reschedul|move|shift|another time|alternative)/.test(prompt)
    ) {
      intent = "reschedule";
    } else if (
      /(find|free|open|gap|slot|block|time for|when am i|availability|fit)/.test(prompt)
    ) {
      intent = "find_time";
    } else {
      intent = input.eventId ? "brief" : "overview";
    }
  }

  let durationMinutes: number | null = null;
  const durationPrompt = prompt.replace(/\bmi+nutes?\b/g, "minutes").replace(/\bminuites?\b/g, "minutes");
  const minutesMatch =
    durationPrompt.match(/(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:minutes?|mins?|m)\b/) ??
    durationPrompt.match(/(\d+)\s*-\s*minute/);
  const hoursMatch = durationPrompt.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (hoursMatch) durationMinutes = Math.round(Number(hoursMatch[1]) * 60);
  else if (minutesMatch) durationMinutes = Math.round(Number(minutesMatch[1]));
  if (durationMinutes !== null) {
    durationMinutes = clamp(durationMinutes, intent === "create_event" ? 5 : 15, intent === "create_event" ? 720 : 240);
  }

  const todayParts = zonedParts(now, tz);
  const todayCivil = civilFromParts(todayParts);
  const todayDow = new Date(
    Date.UTC(todayCivil.year, todayCivil.month - 1, todayCivil.day),
  ).getUTCDay();

  let searchStart: string | null = null;
  let searchEnd: string | null = null;
  let searchEndInclusive = true;

  const beforeIdx = weekdayIndexFromPrompt(prompt, "before|by|until|ahead of");
  if (beforeIdx !== null) {
    const exclusive = /\bbefore\b/.test(prompt);
    const civil = nextCivilForWeekday(beforeIdx, todayCivil, todayDow, !exclusive);
    searchEnd = isoDate(civil);
    searchEndInclusive = !exclusive;
  } else if (/\btomorrow\b/.test(prompt)) {
    searchEnd = isoDate(addCivilDays(todayCivil, 1));
    searchEndInclusive = true;
  }

  const afterIdx = weekdayIndexFromPrompt(prompt, "after|from|starting");
  if (afterIdx !== null) {
    const civil = nextCivilForWeekday(afterIdx, todayCivil, todayDow, false);
    searchStart = isoDate(civil);
  } else if (/\bnext week\b/.test(prompt)) {
    const daysToMonday = ((8 - todayDow) % 7) || 7;
    searchStart = isoDate(addCivilDays(todayCivil, daysToMonday));
    searchEnd = isoDate(addCivilDays(todayCivil, daysToMonday + 4));
    searchEndInclusive = true;
  }

  let requestedStart: string | null = null;
  const clock = requestedClock(prompt);
  const eventDayIndex = weekdayIndexFromPrompt(prompt, "on|this|next");
  const absoluteDay = /\b(\d{4}-\d{2}-\d{2})\b/.exec(prompt)?.[1] ?? null;
  let eventCivil = absoluteDay ? parseCivil(absoluteDay) : null;
  if (!eventCivil && /\btomorrow\b/.test(prompt)) eventCivil = addCivilDays(todayCivil, 1);
  else if (!eventCivil && /\btoday\b/.test(prompt)) eventCivil = todayCivil;
  else if (!eventCivil && eventDayIndex !== null) {
    eventCivil = nextCivilForWeekday(eventDayIndex, todayCivil, todayDow, true);
  }
  if (eventCivil && clock) {
    let date = zonedToUtc(eventCivil, tz, clock.hour, clock.minute);
    if (date.getTime() <= now.getTime() && eventDayIndex !== null) {
      eventCivil = addCivilDays(eventCivil, 7);
      date = zonedToUtc(eventCivil, tz, clock.hour, clock.minute);
    }
    requestedStart = date.toISOString();
  }

  // "Avoiding mornings" must win over the word "focus"/"morning" appearing in
  // the same sentence, so the negative form is checked first.
  const avoidMornings =
    /(?:avoid|skip|no|not|without|cant|cannot|don't want)\s+(?:the\s+)?mornings?\b/.test(
      prompt,
    ) || /(?:afternoons? only|only afternoons?|later in the day)/.test(prompt);

  return {
    intent,
    durationMinutes,
    searchStart,
    searchEnd,
    searchEndInclusive,
    avoidLunch: !/(lunch|whenever|any time|no preference)/.test(prompt),
    preferMornings:
      !avoidMornings && /(morning|early|before lunch|focus)/.test(prompt),
    avoidMornings,
    eventId: input.eventId ?? null,
    eventTitle: input.eventDraft?.title ?? (intent === "create_event" ? requestedEventTitle(prompt) : null),
    requestedDate: input.eventDraft?.requestedDate ?? (eventCivil ? isoDate(eventCivil) : null),
    requestedStart: input.eventDraft?.start ?? requestedStart,
    requestedPeriod:
      (input.eventDraft?.requestedPeriod ??
        (/\b(afternoon|evening|morning)\b/.exec(prompt)?.[1] as
        | "morning"
        | "afternoon"
        | "evening"
        | undefined)) ?? null,
  };
}

const interpretationSchema = z.object({
  intent: z.enum([
    "find_time",
    "brief",
    "conflicts",
    "overview",
    "week_plan",
    "reschedule",
    "create_event",
  ]),
  durationMinutes: z
    .number()
    .nullable()
    .describe("Requested block length in minutes, or null when not stated."),
  searchStart: z
    .string()
    .nullable()
    .describe("First day to search as yyyy-mm-dd, or null."),
  searchEnd: z
    .string()
    .nullable()
    .describe("Last day to search as yyyy-mm-dd, or null."),
  avoidLunch: z.boolean().describe("True unless the user says lunch does not matter."),
  preferMornings: z.boolean().describe("True when mornings are preferred or focus work is mentioned."),
  avoidMornings: z
    .boolean()
    .describe("True when the user explicitly wants to avoid mornings."),
  eventId: z
    .string()
    .nullable()
    .describe("Id of the specific event the user is asking about, if any."),
});

async function interpret(
  input: AssistantInput,
  timeZone: string,
  now: Date,
): Promise<Interpretation> {
  const fallback = heuristicInterpret(input, now);
  if (fallback.intent === "create_event" || input.eventDraft) return fallback;
  if (input.forceIntent) return fallback;
  const model = getModel();
  if (!model) return fallback;

  const eventDigest = input.events
    .filter((event) => inRange(event, input.range))
    .slice(0, 60)
    .map((event) => `${event.id} | ${event.title} | ${dayLabel(new Date(event.start), timeZone)} ${timeLabel(new Date(event.start), timeZone)}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model,
      schema: interpretationSchema,
      temperature: 0.1,
      maxOutputTokens: 400,
      maxRetries: 1,
      providerOptions: providerOptions(),
      abortSignal: AbortSignal.timeout(12_000),
      system:
        "You convert a busy professional's calendar request into a structured search. Never invent events. Resolve relative days using today's date and weekday. Use 24-hour local time. Only pick an eventId when the user clearly refers to one listed event. " +
        "Pick exactly one intent: find_time (the user wants a free slot), brief (background on one meeting), conflicts (the user asks about overlaps, double bookings or clashes), week_plan (the user asks for a plan for the week), reschedule (the user asks to move or find another time for a specific listed event), overview (anything else). " +
        "Any question about conflicts, clashes, double bookings or back-to-back meetings is intent conflicts, never find_time. " +
        "If the user says to avoid mornings, set avoidMornings true and preferMornings false.",
      prompt: [
        `Today is ${weekdayLong(now, timeZone)}, ${fullDayLabel(now, timeZone)} in ${timeZone}.`,
        `Visible range: ${fullDayLabel(new Date(input.range.start), timeZone)} to ${fullDayLabel(new Date(input.range.end), timeZone)}.`,
        `Request: "${input.prompt}"`,
        eventDigest ? `Events:\n${eventDigest}` : "No events are visible.",
        "Default duration for a free-slot request is 45 minutes when the user gives no length.",
      ].join("\n"),
    });

    const intent = input.forceIntent ?? object.intent;
    const duration = object.durationMinutes
      ? clamp(Math.round(object.durationMinutes), 15, 240)
      : fallback.durationMinutes;

    return {
      intent,
      durationMinutes: duration,
      searchStart: parseCivil(object.searchStart) ? object.searchStart : fallback.searchStart,
      searchEnd: parseCivil(object.searchEnd) ? object.searchEnd : fallback.searchEnd,
      searchEndInclusive: fallback.searchEndInclusive,
      avoidLunch: object.avoidLunch,
      preferMornings: object.avoidMornings ? false : object.preferMornings,
      avoidMornings: object.avoidMornings,
      eventId: object.eventId ?? fallback.eventId,
      eventTitle: fallback.eventTitle,
      requestedDate: fallback.requestedDate,
      requestedPeriod: fallback.requestedPeriod,
      requestedStart: fallback.requestedStart,
    };
  } catch {
    return fallback;
  }
}

function buildSearchRange(
  interpretation: Interpretation,
  input: AssistantInput,
  timeZone: string,
): CalendarRange {
  let start = new Date(input.range.start);
  let end = new Date(input.range.end);

  const startCivil = parseCivil(interpretation.searchStart);
  if (startCivil) start = zonedToUtc(startCivil, timeZone);

  const endCivil = parseCivil(interpretation.searchEnd);
  if (endCivil) {
    const nextDay = addCivilDays(endCivil, 1);
    end = zonedToUtc(
      interpretation.searchEndInclusive ? nextDay : endCivil,
      timeZone,
    );
  }

  if (!(end.getTime() > start.getTime())) {
    end = new Date(start.getTime() + 7 * 86_400_000);
  }
  const cap = start.getTime() + 21 * 86_400_000;
  if (end.getTime() > cap) end = new Date(cap);

  return { start: start.toISOString(), end: end.toISOString() };
}

function meetingCountIn(events: CalEvent[], range: CalendarRange) {
  return events.filter(
    (event) => !event.allDay && inRange(event, range) && event.category !== "focus",
  ).length;
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours}h ${rest}m`;
}

function durationAdjective(minutes: number) {
  if (minutes < 60) return `${minutes}-minute`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? "1-hour" : `${hours}-hour`;
  return `${hours}h ${rest}m`;
}

async function narrate(prompt: string, system: string) {
  const model = getModel();
  if (!model) return null;
  try {
    const { text } = await generateText({
      model,
      system,
      prompt,
      temperature: 0.25,
      maxOutputTokens: 400,
      maxRetries: 1,
      providerOptions: providerOptions(),
      abortSignal: AbortSignal.timeout(14_000),
    });
    const cleaned = cleanModelText(text);
    return cleaned.length > 20 ? cleaned : null;
  } catch (cause) {
    console.warn("assistant narration fell back to template:", (cause as Error)?.message);
    return null;
  }
}

const NARRATION_SYSTEM =
  "You are Cadence, a calm scheduling analyst. You explain facts computed from the user's calendar. Never invent events, times, attendees or availability, and never add or remove a result. Reference only the facts provided. If there are no results, say so plainly. Write 2 to 4 short sentences, plain prose, no headings, no emojis, no lists.";

async function buildFindTime(
  input: AssistantInput,
  interpretation: Interpretation,
  timeZone: string,
): Promise<AssistantResult> {
  const duration = interpretation.durationMinutes ?? 45;
  const range = buildSearchRange(interpretation, input, timeZone);
  const preferences = normalizePreferences(input.preferences);
  const candidates = findOpenSlots(input.events, {
    range,
    durationMinutes: duration,
    timeZone,
    avoidLunch: interpretation.avoidLunch && preferences.protectLunch,
    preferMornings:
      !interpretation.avoidMornings &&
      (interpretation.preferMornings || preferences.preferMornings),
    preferences,
    limit: interpretation.avoidMornings ? 12 : 4,
  });
  const slots = interpretation.avoidMornings
    ? candidates
        .filter(
          (slot) => Number(timeLabel(new Date(slot.start), timeZone).slice(0, 2)) >= 12,
        )
        .slice(0, 4)
    : candidates;

  const meetings = meetingCountIn(input.events, range);
  const rangeStartLabel = fullDayLabel(new Date(range.start), timeZone);
  const rangeEndLabel = fullDayLabel(
    new Date(new Date(range.end).getTime() - 60_000),
    timeZone,
  );

  let headline: string;
  let fallback: string;

  if (slots.length > 0) {
    headline = `${slots.length} window${slots.length === 1 ? "" : "s"} for a ${durationAdjective(duration)} block`;
    const best = slots[0];
    fallback = `Your best opening is ${best.dayLabel}, ${best.timeLabel} — ${best.reasons[0]}. I found ${slots.length} clean window${slots.length === 1 ? "" : "s"} in that range around ${meetings} meeting${meetings === 1 ? "" : "s"}. Nothing has been moved: review the options below and pick one.`;
  } else {
    headline = `No clean ${durationAdjective(duration)} opening`;
    fallback = `I could not find a ${durationAdjective(duration)} gap between 09:00 and 18:00 from ${rangeStartLabel} to ${rangeEndLabel}. That window contains ${meetings} meeting${meetings === 1 ? "" : "s"} and the remaining gaps are shorter than the block you asked for. Widening the dates or shortening the block to ${Math.max(15, Math.min(30, duration))} minutes would open something up.`;
  }

  const facts =
    slots.length > 0
      ? slots
          .map(
            (slot, index) =>
              `${index + 1}. ${slot.dayLabel}, ${slot.timeLabel} (${slot.minutes}m, score ${slot.score}; ${slot.reasons.join("; ")})`,
          )
          .join("\n")
      : "No qualifying slots.";
  const narration = await narrate(
    [
      `Today: ${weekdayLong(new Date(), timeZone)} ${fullDayLabel(new Date(), timeZone)}, ${timeZone}.`,
      `Request: "${input.prompt}"`,
      `Constraints: ${durationLabel(duration)} block, ${String(preferences.workdayStart).padStart(2, "0")}:00–${String(preferences.workdayEnd).padStart(2, "0")}:00, lunch ${interpretation.avoidLunch && preferences.protectLunch ? "protected" : "not protected"}, mornings ${interpretation.avoidMornings ? "excluded" : interpretation.preferMornings ? "preferred" : "neutral"}, ${meetings} existing meetings in the window.`,
      `Computed slots (this is the complete list):\n${facts}`,
      "Say which slot to take and why, in at most three sentences. Do not mention scores or invent other times.",
    ].join("\n"),
    NARRATION_SYSTEM,
  );

  return {
    intent: "find_time",
    headline,
    answer: narration ?? fallback,
    slots,
    conflicts: [],
    brief: null,
    reschedule: null,
    usedModel: Boolean(narration),
    model: narration ? AI_MODEL : null,
  };
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function item(text: string, source: BriefSource): BriefItem {
  return { text, source };
}

/** The invite's stated purpose: the first sentences of its description. */
function invitePurpose(description: string): string | null {
  const sentences = splitSentences(description);
  if (sentences.length === 0) return null;
  return sentences.slice(0, 2).join(" ").slice(0, 320);
}

/** Bulleted or numbered agenda lines on the invite, if it has any. */
function inviteAgenda(description: string): string[] {
  return description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, "").slice(0, 180))
    .filter(Boolean)
    .slice(0, 5);
}

function fallbackBrief(event: CalEvent, timeZone: string): BriefSection[] {
  const description = event.description?.trim() ?? "";
  const text = `${event.title} ${description}`.toLowerCase();
  const others = (event.attendees ?? []).filter((attendee) => !attendee.self);
  const purpose = invitePurpose(description);
  const agenda = inviteAgenda(description);

  const prep: string[] = [];
  if (/(budget|spend|cost|pricing|renewal|contract|forecast)/.test(text)) {
    prep.push(
      "Bring the numbers: current spend, the delta you are asking for, and the fallback if the answer is no.",
    );
  }
  if (/(escalat|outage|incident|bug|regression|remediation)/.test(text)) {
    prep.push(
      "Write the remediation timeline before the call: what broke, the fix, and the date it lands.",
    );
  }
  if (/(roadmap|plan|q[1-4]|priorit|strategy)/.test(text)) {
    prep.push(
      "Decide what you are willing to drop. A planning review without a cut is just a status update.",
    );
  }
  if (/(interview|hiring|candidate|loop)/.test(text)) {
    prep.push(
      "Re-read the scorecard criteria and prepare two probing questions on the weakest signal.",
    );
  }
  if (/(1:1|one-on-one|one on one)/.test(text)) {
    prep.push("Open with their agenda, not yours. Bring one thing to unblock and one thing to recognise.");
  }
  if (others.length >= 4) {
    prep.push(
      "Send a short agenda the day before; with this many people an unstructured hour will drift.",
    );
  }
  if (prep.length === 0) {
    prep.push(
      "Skim the last thread on this topic and write the single decision you want to leave with.",
    );
  }

  const questions = [
    "What decision do we need to make before this meeting ends?",
    /(budget|spend|cost|pricing|renewal)/.test(text)
      ? "What would make this spend easy to approve, and what would make it a no?"
      : "What would make this meeting worth the hour for everyone in the room?",
    /(escalat|outage|incident)/.test(text)
      ? "What date can we commit to in writing, and who owns the follow-up?"
      : "Who owns the next step, and by when?",
  ];

  const when = `${fullDayLabel(new Date(event.start), timeZone)}, ${timeLabel(new Date(event.start), timeZone)} – ${timeLabel(new Date(event.end), timeZone)}`;

  return [
    {
      heading: "Purpose",
      items: purpose
        ? [item(purpose, "invite")]
        : [item("The invite has no description, so its purpose is not stated anywhere.", "invite")],
    },
    {
      heading: "Agenda",
      items:
        agenda.length > 0
          ? agenda.map((entry) => item(entry, "invite"))
          : [item("The invite lists no agenda — propose one at the top of the meeting.", "inferred")],
    },
    {
      heading: "Who is in the room",
      items:
        others.length > 0
          ? others
              .slice(0, 8)
              .map((attendee) =>
                item(
                  `${attendee.name ?? attendee.email ?? "Guest"}${attendee.responseStatus === "declined" ? " (declined)" : attendee.responseStatus === "tentative" ? " (tentative)" : ""}`,
                  "attendees",
                ),
              )
          : [item("Just you — protect the block and close the door.", "calendar")],
    },
    { heading: "Suggested prep", items: prep.slice(0, 4).map((entry) => item(entry, "inferred")) },
    {
      heading: "Questions to bring",
      items: questions.slice(0, 3).map((entry) => item(entry, "inferred")),
    },
    {
      heading: "Logistics",
      items: [
        item(`${when}${event.location ? ` · ${event.location}` : ""}`, "calendar"),
        item(event.recurring ? "Part of a recurring series." : "One-off meeting.", "calendar"),
      ],
    },
  ];
}

const briefSchema = z.object({
  context: z.string().describe("Two sentences on what this meeting is really about."),
  talkingPoints: z.array(z.string()).min(2).max(5),
  questions: z.array(z.string()).min(2).max(5),
  prep: z.array(z.string()).min(1).max(4),
});

function fuzzyEventMatch(prompt: string, events: CalEvent[]) {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  if (!words.length) return null;
  let best: { event: CalEvent; score: number } | null = null;
  for (const event of events) {
    const title = event.title.toLowerCase();
    const score = words.reduce((total, word) => (title.includes(word) ? total + 1 : total), 0);
    if (score > 0 && (!best || score > best.score)) best = { event, score };
  }
  return best?.event ?? null;
}

async function buildBrief(
  input: AssistantInput,
  interpretation: Interpretation,
  timeZone: string,
): Promise<AssistantResult> {
  const event =
    input.events.find((item) => item.id === (input.eventId ?? interpretation.eventId)) ??
    fuzzyEventMatch(input.prompt, input.events) ??
    null;

  if (!event) {
    return {
      intent: "brief",
      headline: "Pick a meeting first",
      answer:
        "Select a meeting on the calendar and I will build a short brief from the invite: context, who is in the room, what to prepare, and the questions worth asking.",
      slots: [],
      conflicts: [],
      brief: null,
      reschedule: null,
      usedModel: false,
      model: null,
    };
  }

  const insufficient = !event.description?.trim();
  const fallbackSections = fallbackBrief(event, timeZone);
  const model = getModel();
  let sections = fallbackSections;
  let usedModel = false;

  if (model) {
    const others = (event.attendees ?? []).filter((attendee) => !attendee.self);
    try {
      const { object } = await generateObject({
        model,
        schema: briefSchema,
        temperature: 0.3,
        maxOutputTokens: 600,
        maxRetries: 1,
        providerOptions: providerOptions(),
        abortSignal: AbortSignal.timeout(16_000),
        system:
          "You write concise meeting briefs for a busy operator. Use only the event details provided. Do not invent facts about the company, the attendees, or previous meetings. If the description is thin, give practical prep steps and questions instead of inventing context. Plain sentences, no emojis.",
        prompt: [
          `Event: ${event.title}`,
          `When: ${fullDayLabel(new Date(event.start), timeZone)}, ${timeLabel(new Date(event.start), timeZone)} – ${timeLabel(new Date(event.end), timeZone)} (${timeZone})`,
          `Duration: ${Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000)} minutes`,
          event.location ? `Location: ${event.location}` : "Location: not specified",
          `Attendees: ${others.length ? others.map((attendee) => attendee.name ?? "Guest").join(", ") : "none besides the owner"}`,
          event.recurring ? "This is a recurring meeting." : "This is a one-off meeting.",
          `Description on the invite:\n${event.description?.slice(0, 1500) ?? "(none)"}`,
          "Return: context (2 sentences), talkingPoints (3), questions (3), prep (2).",
        ].join("\n"),
      });
      sections = [
        { heading: "Purpose", items: [item(object.context, "inferred")] },
        {
          heading: "Who is in the room",
          items:
            others.length > 0
              ? others
                  .slice(0, 8)
                  .map((attendee) =>
                    item(attendee.name ?? attendee.email ?? "Guest", "attendees"),
                  )
              : [item("Just you — protect the block and close the door.", "calendar")],
        },
        {
          heading: "Talking points",
          items: object.talkingPoints.map((entry) => item(entry, "inferred")),
        },
        {
          heading: "Questions to bring",
          items: object.questions.map((entry) => item(entry, "inferred")),
        },
        { heading: "Suggested prep", items: object.prep.map((entry) => item(entry, "inferred")) },
      ];
      usedModel = true;
    } catch {
      sections = fallbackSections;
    }
  }

  return {
    intent: "brief",
    headline: event.title,
    answer: insufficient
      ? `This invite has no description, so there is not enough information for a real summary. Below is general preparation for a ${Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000)}-minute meeting on ${fullDayLabel(new Date(event.start), timeZone)}: add an agenda to the invite and regenerate for specifics.`
      : `A short brief for ${fullDayLabel(new Date(event.start), timeZone)} at ${timeLabel(new Date(event.start), timeZone)}. Every line is marked with where it came from, and nothing outside this invite was used.`,
    slots: [],
    conflicts: [],
    brief: { eventId: event.id, sections, insufficient },
    reschedule: null,
    usedModel,
    model: usedModel ? AI_MODEL : null,
  };
}

async function buildConflicts(
  input: AssistantInput,
  timeZone: string,
): Promise<AssistantResult> {
  const scoped = input.events.filter((event) => inRange(event, input.range));
  const conflicts = detectConflicts(scoped, timeZone);

  if (conflicts.length === 0) {
    return {
      intent: "conflicts",
      headline: "No clashes in this range",
      answer:
        "I found no overlaps, no back-to-back runs under ten minutes, and no day without a usable gap. If the week still feels heavy, the next step is protecting a focus block rather than moving meetings.",
      slots: [],
      conflicts: [],
      brief: null,
      reschedule: null,
      usedModel: false,
      model: null,
    };
  }

  const headline = `${conflicts.length} scheduling issue${conflicts.length === 1 ? "" : "s"} worth reviewing`;
  const fallback = `${conflicts[0].title}. ${conflicts[0].detail} The simplest fix is to ${conflicts[0].suggestion.charAt(0).toLowerCase()}${conflicts[0].suggestion.slice(1)} I found ${conflicts.length} issue${conflicts.length === 1 ? "" : "s"} in total; the rest are listed below.`;

  const facts = conflicts
    .map(
      (conflict, index) =>
        `${index + 1}. [${conflict.severity}] ${conflict.title} — ${conflict.detail} Suggested fix: ${conflict.suggestion}`,
    )
    .join("\n");

  const narration = await narrate(
    [
      `Request: "${input.prompt}"`,
      `Computed issues (complete list, do not add any):\n${facts}`,
      "Name the single issue to fix first and why, in at most three sentences. Be specific about the day and time. Do not invent other meetings.",
    ].join("\n"),
    NARRATION_SYSTEM,
  );

  return {
    intent: "conflicts",
    headline,
    answer: narration ?? fallback,
    slots: [],
    conflicts,
    brief: null,
    reschedule: null,
    usedModel: Boolean(narration),
    model: narration ? AI_MODEL : null,
  };
}

async function buildOverview(
  input: AssistantInput,
  timeZone: string,
): Promise<AssistantResult> {
  const stats = computeWeekStats(input.events, input.range, timeZone);
  const upcoming = nextEvent(
    input.events.filter((event) => inRange(event, input.range)),
  );
  const conflicts = detectConflicts(
    input.events.filter((event) => inRange(event, input.range)),
    timeZone,
  );

  const headline =
    stats.meetingHours >= 18
      ? "A heavy week"
      : stats.conflicts > 0
        ? "Mostly clear, with a few collisions"
        : "A workable week";

  const nextLine = upcoming
    ? `Next up is “${upcoming.title}” on ${fullDayLabel(new Date(upcoming.start), timeZone)} at ${timeLabel(new Date(upcoming.start), timeZone)}.`
    : "There is no upcoming meeting in this range.";

  const fallback = `${stats.meetingCount} meetings take ${stats.meetingHours} hours, with ${stats.focusHours} hours of protected focus time${stats.busiestDay ? ` and ${stats.busiestDay} as the heaviest day` : ""}. ${stats.conflicts > 0 ? `There ${stats.conflicts === 1 ? "is" : "are"} ${stats.conflicts} non-trivial scheduling issue${stats.conflicts === 1 ? "" : "s"} to review.` : "No significant clashes were detected."} ${nextLine}`;

  const narration = await narrate(
    [
      `Week facts: ${stats.meetingCount} meetings, ${stats.meetingHours} hours booked, ${stats.focusHours} hours of focus blocks, ${stats.conflicts} conflicts, busiest day ${stats.busiestDay ?? "none"}.`,
      upcoming
        ? `Next meeting: ${upcoming.title}, ${fullDayLabel(new Date(upcoming.start), timeZone)} ${timeLabel(new Date(upcoming.start), timeZone)}, ${Math.round((new Date(upcoming.end).getTime() - new Date(upcoming.start).getTime()) / 60_000)} minutes.`
        : "No upcoming meeting.",
      conflicts.length
        ? `Top issue: ${conflicts[0].title} — ${conflicts[0].detail}`
        : "No conflicts.",
      "Write a two-sentence read of this week. Do not invent anything beyond these facts.",
    ].join("\n"),
    NARRATION_SYSTEM,
  );

  return {
    intent: "overview",
    headline,
    answer: narration ?? fallback,
    slots: [],
    conflicts: conflicts.slice(0, 3),
    brief: null,
    reschedule: null,
    usedModel: Boolean(narration),
    model: narration ? AI_MODEL : null,
  };
}

async function buildWeekPlan(
  input: AssistantInput,
  timeZone: string,
): Promise<AssistantResult> {
  const preferences = normalizePreferences(input.preferences);
  const scoped = input.events.filter((event) => inRange(event, input.range));
  const stats = computeWeekStats(input.events, input.range, timeZone);
  const conflicts = detectConflicts(scoped, timeZone).filter(
    (conflict) => conflict.severity !== "low",
  );
  const overloaded = conflicts.filter(
    (conflict) => conflict.type === "overloaded" || conflict.type === "no_focus",
  );
  const duration = preferences.focusBlockMinutes;
  const slots = findOpenSlots(input.events, {
    range: input.range,
    durationMinutes: duration,
    timeZone,
    avoidLunch: preferences.protectLunch,
    preferMornings: preferences.preferMornings,
    preferences,
    limit: 3,
  });

  const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  const workday = `${clock(preferences.workdayStart)}–${clock(preferences.workdayEnd)}`;

  const headline = slots.length
    ? `A ${durationAdjective(duration)} focus plan for this week`
    : "No clean focus window this week";

  const bestLine = slots.length
    ? `The best opening is ${slots[0].dayLabel}, ${slots[0].timeLabel} — ${slots[0].reasons[0]}.`
    : `I found no ${duration}-minute gap inside ${workday}.`;
  const overloadLine = overloaded.length
    ? ` ${overloaded.length === 1 ? "One day is" : `${overloaded.length} days are`} overloaded: ${overloaded
        .slice(0, 3)
        .map((conflict) => conflict.title)
        .join("; ")}.`
    : " No day is booked past four hours of meetings.";

  const fallback = `${stats.meetingCount} meetings take ${stats.meetingHours} hours, with ${stats.focusHours} hours already protected for focus. ${bestLine}${overloadLine} Ranked with your preferences: ${workday}, ${preferences.protectLunch ? "lunch protected" : "lunch open"}, ${preferences.bufferMinutes}-minute buffer, ${preferences.preferMornings ? "mornings preferred" : "no morning bias"}.`;

  const facts = [
    `Meetings: ${stats.meetingCount} over ${stats.meetingHours}h; focus already booked: ${stats.focusHours}h; heaviest day: ${stats.busiestDay ?? "none"}.`,
    slots.length
      ? `Suggested focus windows:\n${slots
          .map(
            (slot, index) =>
              `${index + 1}. ${slot.dayLabel} ${slot.timeLabel} (${slot.minutes}m, score ${slot.score}; ${slot.reasons.join("; ")})`,
          )
          .join("\n")}`
      : "Suggested focus windows: none.",
    overloaded.length
      ? `Overloaded days: ${overloaded.map((conflict) => `${conflict.title} — ${conflict.detail}`).join(" | ")}`
      : "Overloaded days: none.",
    `Preferences: ${workday}, buffer ${preferences.bufferMinutes} minutes, lunch ${preferences.protectLunch ? "protected" : "open"}, mornings ${preferences.preferMornings ? "preferred" : "not preferred"}.`,
  ].join("\n");

  const narration = await narrate(
    [
      `Request: "${input.prompt}"`,
      facts,
      "Give a two or three sentence plan: name the focus window to protect and the day that needs relief. Only use these facts; do not invent times.",
    ].join("\n"),
    NARRATION_SYSTEM,
  );

  return {
    intent: "week_plan",
    headline,
    answer: narration ?? fallback,
    slots,
    conflicts: conflicts.slice(0, 3),
    brief: null,
    reschedule: null,
    usedModel: Boolean(narration),
    model: narration ? AI_MODEL : null,
  };
}

function eventSlot(start: Date, durationMinutes: number, timeZone: string): AiSlot {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    minutes: durationMinutes,
    dayLabel: dayLabel(start, timeZone),
    timeLabel: `${timeLabel(start, timeZone)} – ${timeLabel(end, timeZone)}`,
    score: 100,
    reasons: ["the time you requested"],
  };
}

function extractPromptField(prompt: string, labels: string[]) {
  const labelPattern = labels.join("|");
  const stopPattern = ["agenda", "description", "notes?", "location", "place", "attendees?"].join("|");
  const match = new RegExp(`\\b(?:${labelPattern})\\s*:\\s*([\\s\\S]*?)(?=\\s+\\b(?:${stopPattern})\\s*:|$)`, "i").exec(prompt);
  return match?.[1]?.trim().slice(0, 5000) ?? "";
}

function extractEventAgenda(prompt: string) {
  return extractPromptField(prompt, ["agenda"]);
}

function extractEventDescription(prompt: string) {
  return extractPromptField(prompt, ["description", "notes?"]);
}

function extractEventLocation(prompt: string) {
  const match = /\b(?:location|place)\s*:\s*([\s\S]*?)(?=\s+\b(?:agenda|description|notes?|attendees?)\s*:|$)/i.exec(prompt);
  return match?.[1]?.trim().slice(0, 500) ?? "";
}

function extractAttendeeEmails(prompt: string) {
  const emails = prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(emails.map((email) => email.toLowerCase()))].slice(0, 100);
}

async function buildCreateEvent(
  input: AssistantInput,
  interpretation: Interpretation,
  timeZone: string,
): Promise<AssistantResult> {
  const title = (input.eventDraft?.title ?? interpretation.eventTitle ?? "Meeting").trim().slice(0, 200);
  const agenda = input.eventDraft?.agenda ?? extractEventAgenda(input.prompt);
  const description = input.eventDraft?.description ?? extractEventDescription(input.prompt);
  const location = input.eventDraft?.location ?? extractEventLocation(input.prompt);
  const attendees = input.eventDraft?.attendees ?? extractAttendeeEmails(input.prompt);
  const duration = input.eventDraft?.durationMinutes ?? interpretation.durationMinutes;
  const requestedDate = input.eventDraft?.requestedDate ?? interpretation.requestedDate;
  const requestedPeriod = interpretation.requestedPeriod;
  const requestedStart = input.eventDraft?.start ?? interpretation.requestedStart;

  if (!duration) {
    const eventDraft: EventDraft = {
      title,
      agenda,
      description,
      location,
      attendees,
      requestedDate,
      requestedPeriod,
      start: requestedStart,
      durationMinutes: null,
      status: "needs_duration",
      options: [],
      note: null,
    };
    return {
      intent: "create_event",
      headline: "How long should the meeting be?",
      answer: `I understood “${title}”${requestedStart ? ` for ${fullDayLabel(new Date(requestedStart), timeZone)} at ${timeLabel(new Date(requestedStart), timeZone)}` : requestedDate ? ` for ${requestedDate}${requestedPeriod ? ` in the ${requestedPeriod}` : ""}` : ""}. Choose a duration, then I’ll check the calendar and show exactly what would be created.`,
      slots: [],
      conflicts: [],
      brief: null,
      reschedule: null,
      eventDraft,
      usedModel: false,
      model: null,
    };
  }

  const preferences = normalizePreferences(input.preferences);
  const civilTarget = requestedDate
    ? parseCivil(requestedDate)
    : requestedStart
      ? civilFromParts(zonedParts(new Date(requestedStart), timeZone))
      : null;
  const dateRange = (days: number) => {
    if (!civilTarget) return input.range;
    return {
      start: zonedToUtc(civilTarget, timeZone).toISOString(),
      end: zonedToUtc(addCivilDays(civilTarget, days), timeZone).toISOString(),
    };
  };
  const preferredPeriod = (slot: AiSlot) => {
    if (!requestedPeriod) return true;
    const hour = zonedParts(new Date(slot.start), timeZone).hour;
    if (requestedPeriod === "morning") return hour >= 6 && hour < 12;
    if (requestedPeriod === "afternoon") return hour >= 12 && hour < 17;
    return hour >= 17 && hour < 22;
  };
  const findOptions = (days: number) =>
    findOpenSlots(input.events, {
      range: dateRange(days),
      durationMinutes: duration,
      timeZone,
      preferences,
      avoidLunch: preferences.protectLunch,
      preferMornings: preferences.preferMornings,
      limit: 12,
    }).filter(preferredPeriod);
  const requestedDayOptions = civilTarget ? findOptions(1) : [];
  const alternatives = (requestedDayOptions.length > 0
    ? requestedDayOptions
    : findOptions(civilTarget ? 7 : 1)
  ).slice(0, 3);
  const requestedDayLabel = civilTarget
    ? fullDayLabel(zonedToUtc(civilTarget, timeZone), timeZone)
    : null;

  if (requestedStart) {
    const start = new Date(requestedStart);
    const requested = eventSlot(start, duration, timeZone);
    const padding = preferences.bufferMinutes * 60_000;
    const collision = input.events.some((event) => {
      if (event.status === "cancelled") return false;
      const busyStart = new Date(event.start).getTime();
      const busyEnd = new Date(event.end).getTime();
      return (
        Number.isFinite(busyStart) &&
        Number.isFinite(busyEnd) &&
        start.getTime() < busyEnd + padding &&
        new Date(requested.end).getTime() > busyStart - padding
      );
    });

    if (!collision) {
      const draft: EventDraft = {
        title,
        agenda,
        description,
        location,
        attendees,
        requestedDate,
        requestedPeriod,
        start: requested.start,
        durationMinutes: duration,
        status: "confirm",
        options: [requested],
        note: null,
      };
      return {
        intent: "create_event",
        headline: "Review before creating",
        answer: `That time is open. Review the title and time below, then confirm to add it to your Google Calendar.`,
        slots: [],
        conflicts: [],
        brief: null,
        reschedule: null,
        eventDraft: draft,
        usedModel: false,
        model: null,
      };
    }

    const draft: EventDraft = {
      title,
      agenda,
      description,
      location,
      attendees,
      requestedDate,
      requestedPeriod,
      start: null,
      durationMinutes: duration,
      status: "choose_time",
      options: alternatives,
      note: `That time overlaps another event or your ${preferences.bufferMinutes}-minute buffer. Choose an open${requestedPeriod ? ` ${requestedPeriod}` : ""} alternative${requestedDate ? ` on or after ${requestedDate}` : ""}.`,
    };
    return {
      intent: "create_event",
      headline: "That time is busy",
      answer: `I can’t place “${title}” at ${fullDayLabel(start, timeZone)} ${timeLabel(start, timeZone)} without overlapping your calendar. Choose one of the open alternatives below.`,
      slots: [],
      conflicts: [],
      brief: null,
      reschedule: null,
      eventDraft: draft,
      usedModel: false,
      model: null,
    };
  }

  const draft: EventDraft = {
    title,
    agenda,
    description,
    location,
    attendees,
    requestedDate,
    requestedPeriod,
    start: null,
    durationMinutes: duration,
    status: "choose_time",
    options: alternatives,
    note:
      requestedDayLabel && requestedDayOptions.length === 0
        ? `No open ${requestedPeriod ?? "time"} on ${requestedDayLabel}. Choose one of the next available options.`
        : "Choose an open time to continue.",
  };
  return {
    intent: "create_event",
    headline: "Choose a time",
    answer: `I understood this as a ${duration}-minute “${title}” meeting${requestedDayLabel ? ` on ${requestedDayLabel}` : requestedDate ? ` on ${requestedDate}` : ""}${requestedPeriod ? ` in the ${requestedPeriod}` : ""}. ${requestedDayLabel && requestedDayOptions.length === 0 ? `There is no open ${requestedPeriod ?? "time"} that day, so I found the next available options. ` : ""}Choose an open option below, then review it before creation.`,
    slots: [],
    conflicts: [],
    brief: null,
    reschedule: null,
    eventDraft: draft,
    usedModel: false,
    model: null,
  };
}

/** Identifies a clash by its type and the other event involved, not its time. */
function conflictKey(conflict: AiConflict, eventId: string) {
  const others = conflict.eventIds.filter((id) => id !== eventId).sort().join("|");
  return `${conflict.type}:${others}`;
}

async function buildReschedule(
  input: AssistantInput,
  interpretation: Interpretation,
  timeZone: string,
): Promise<AssistantResult> {
  const eventId = input.eventId ?? interpretation.eventId;
  const event = input.events.find((entry) => entry.id === eventId) ?? null;

  if (!event || event.allDay) {
    return {
      intent: "reschedule",
      headline: "Pick a timed meeting to move",
      answer:
        "Select a timed meeting on the calendar first, then preview where it could move. All-day blocks cannot be rescheduled here.",
      slots: [],
      conflicts: [],
      brief: null,
      reschedule: null,
      usedModel: false,
      model: null,
    };
  }

  const preferences = normalizePreferences(input.preferences);
  const minutes = Math.max(
    5,
    Math.round(
      (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000,
    ),
  );
  const others = input.events.filter((entry) => entry.id !== event.id);
  const candidates = findOpenSlots(others, {
    range: input.range,
    durationMinutes: minutes,
    timeZone,
    avoidLunch: preferences.protectLunch,
    preferMornings: preferences.preferMornings,
    preferences,
    limit: 6,
  });

  const currentConflicts = detectConflicts(input.events, timeZone).filter((conflict) =>
    conflict.eventIds.includes(event.id),
  );
  const currentKeys = new Set(
    currentConflicts.map((conflict) => conflictKey(conflict, event.id)),
  );
  const currentStart = new Date(event.start).getTime();
  const currentEnd = new Date(event.end).getTime();

  const options: RescheduleOption[] = candidates
    .filter((candidate) => {
      const start = new Date(candidate.start).getTime();
      const end = new Date(candidate.end).getTime();
      return start !== currentStart || end !== currentEnd;
    })
    .map((candidate) => {
      const moved = input.events.map((entry) =>
        entry.id === event.id
          ? { ...entry, start: candidate.start, end: candidate.end }
          : entry,
      );
      const nextConflicts = detectConflicts(moved, timeZone).filter((conflict) =>
        conflict.eventIds.includes(event.id),
      );
      const nextKeys = new Set(
        nextConflicts.map((conflict) => conflictKey(conflict, event.id)),
      );
      return {
        ...candidate,
        fixes: currentConflicts
          .filter((conflict) => !nextKeys.has(conflictKey(conflict, event.id)))
          .map((conflict) => conflict.title),
        creates: nextConflicts
          .filter((conflict) => !currentKeys.has(conflictKey(conflict, event.id)))
          .map((conflict) => conflict.title),
      };
    })
    .sort((a, b) => {
      const rank = (option: RescheduleOption) =>
        option.score + option.fixes.length * 12 - option.creates.length * 18;
      return rank(b) - rank(a);
    })
    .slice(0, 3);

  const currentLabel = `${fullDayLabel(new Date(event.start), timeZone)}, ${timeLabel(new Date(event.start), timeZone)}–${timeLabel(new Date(event.end), timeZone)}`;

  if (options.length === 0) {
    return {
      intent: "reschedule",
      headline: "No clean alternative",
      answer: `There is no ${minutes}-minute opening inside your working hours that does not collide with something else, so moving “${event.title}” would create a new problem. Shortening it or widening the dates would give me options.`,
      slots: [],
      conflicts: currentConflicts.slice(0, 2),
      brief: null,
      reschedule: { eventId: event.id, currentLabel, options: [] },
      usedModel: false,
      model: null,
    };
  }

  const best = options[0];
  const effect = best.creates.length
    ? `it would introduce ${best.creates.length} new clash${best.creates.length === 1 ? "" : "es"}`
    : best.fixes.length
      ? `it would clear ${best.fixes.length} existing clash${best.fixes.length === 1 ? "" : "es"}`
      : "nothing else on the calendar would change";

  const fallback = `“${event.title}” currently sits at ${currentLabel}. The best alternative is ${best.dayLabel}, ${best.timeLabel}: ${effect}. I found ${options.length} option${options.length === 1 ? "" : "s"}; nothing moves until you confirm one.`;

  const narration = await narrate(
    [
      `Request: "${input.prompt}"`,
      `Event: ${event.title}, currently ${currentLabel}.`,
      `Options (complete list):\n${options
        .map(
          (option, index) =>
            `${index + 1}. ${option.dayLabel} ${option.timeLabel} — fixes: ${option.fixes.join("; ") || "none"}; creates: ${option.creates.join("; ") || "none"}`,
        )
        .join("\n")}`,
      "Recommend one option in two sentences, naming what it fixes or breaks. Do not invent times or meetings.",
    ].join("\n"),
    NARRATION_SYSTEM,
  );

  return {
    intent: "reschedule",
    headline: `${options.length} alternative${options.length === 1 ? "" : "s"} for “${event.title}”`,
    answer: narration ?? fallback,
    slots: [],
    conflicts: currentConflicts.slice(0, 2),
    brief: null,
    reschedule: { eventId: event.id, currentLabel, options },
    usedModel: Boolean(narration),
    model: narration ? AI_MODEL : null,
  };
}

export async function runAssistant(input: AssistantInput): Promise<AssistantResult> {
  const timeZone = safeTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const interpretation = await interpret(input, timeZone, now);
  const intent = input.forceIntent ?? interpretation.intent;
  const normalized = { ...interpretation, intent };

  if (intent === "brief") return buildBrief(input, normalized, timeZone);
  if (intent === "find_time") return buildFindTime(input, normalized, timeZone);
  if (intent === "conflicts") return buildConflicts(input, timeZone);
  if (intent === "week_plan") return buildWeekPlan(input, timeZone);
  if (intent === "reschedule") return buildReschedule(input, normalized, timeZone);
  if (intent === "create_event") return buildCreateEvent(input, normalized, timeZone);
  return buildOverview(input, timeZone);
}
