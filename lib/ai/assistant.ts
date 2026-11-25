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
import type {
  AssistantResult,
  BriefSection,
  CalEvent,
  CalendarMode,
  CalendarRange,
} from "../types";

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

export type AssistantIntent = "find_time" | "brief" | "conflicts" | "overview";

export interface AssistantInput {
  prompt: string;
  events: CalEvent[];
  range: CalendarRange;
  timeZone: string;
  mode: CalendarMode;
  eventId?: string | null;
  forceIntent?: AssistantIntent | null;
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
  eventId: string | null;
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
  const pattern = new RegExp(
    `\\b(?:${prefixPattern})\\s+(?:next\\s+)?(${WEEKDAY_WORDS.join("|")})\\b`,
    "i",
  );
  const match = pattern.exec(prompt);
  if (!match) return null;
  return WEEKDAY_WORDS.indexOf(match[1].toLowerCase() as (typeof WEEKDAY_WORDS)[number]);
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
    if (
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
      /(find|free|open|gap|slot|block|time for|when am i|availability|fit)/.test(prompt)
    ) {
      intent = "find_time";
    } else {
      intent = input.eventId ? "brief" : "overview";
    }
  }

  let durationMinutes: number | null = null;
  const minutesMatch =
    prompt.match(/(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:minutes?|mins?|m)\b/) ??
    prompt.match(/(\d+)\s*-\s*minute/);
  const hoursMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (hoursMatch) durationMinutes = Math.round(Number(hoursMatch[1]) * 60);
  else if (minutesMatch) durationMinutes = Math.round(Number(minutesMatch[1]));
  if (durationMinutes !== null) durationMinutes = clamp(durationMinutes, 15, 240);

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

  return {
    intent,
    durationMinutes,
    searchStart,
    searchEnd,
    searchEndInclusive,
    avoidLunch: !/(lunch|whenever|any time|no preference)/.test(prompt),
    preferMornings: /(morning|early|before lunch|focus)/.test(prompt),
    eventId: input.eventId ?? null,
  };
}

const interpretationSchema = z.object({
  intent: z.enum(["find_time", "brief", "conflicts", "overview"]),
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
        "Pick exactly one intent: find_time (the user wants a free slot), brief (background on one meeting), conflicts (the user asks about overlaps, double bookings or clashes), overview (anything else). " +
        "Any question about conflicts, clashes, double bookings or back-to-back meetings is intent conflicts, never find_time.",
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
      preferMornings: object.preferMornings,
      eventId: object.eventId ?? fallback.eventId,
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
  const slots = findOpenSlots(input.events, {
    range,
    durationMinutes: duration,
    timeZone,
    avoidLunch: interpretation.avoidLunch,
    preferMornings: interpretation.preferMornings,
    limit: 4,
  });

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
      `Constraints: ${durationLabel(duration)} block, 09:00–18:00, lunch ${interpretation.avoidLunch ? "protected" : "not protected"}, ${meetings} existing meetings in the window.`,
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

function fallbackBrief(event: CalEvent, timeZone: string): BriefSection[] {
  const description = event.description?.trim() ?? "";
  const text = `${event.title} ${description}`.toLowerCase();
  const others = (event.attendees ?? []).filter((attendee) => !attendee.self);

  const context = description
    ? splitSentences(description).slice(0, 3).map((sentence) => sentence.slice(0, 260))
    : [
        "No agenda or notes are attached to this invite. Open with a one-line framing of the decision you need, or the meeting will drift.",
      ];

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
    { heading: "What this is", items: context },
    {
      heading: "Who is in the room",
      items:
        others.length > 0
          ? others
              .slice(0, 8)
              .map(
                (attendee) =>
                  `${attendee.name ?? attendee.email ?? "Guest"}${attendee.responseStatus === "declined" ? " (declined)" : attendee.responseStatus === "tentative" ? " (tentative)" : ""}`,
              )
          : ["Just you — protect the block and close the door."],
    },
    { heading: "Suggested prep", items: prep.slice(0, 4) },
    { heading: "Questions to ask", items: questions.slice(0, 3) },
    { heading: "Logistics", items: [`${when}${event.location ? ` · ${event.location}` : ""}`, event.recurring ? "Part of a recurring series." : "One-off meeting."] },
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
      usedModel: false,
      model: null,
    };
  }

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
          `Attendees: ${others.length ? others.map((attendee) => attendee.name ?? attendee.email).join(", ") : "none besides the owner"}`,
          event.recurring ? "This is a recurring meeting." : "This is a one-off meeting.",
          `Description on the invite:\n${event.description?.slice(0, 1500) ?? "(none)"}`,
          "Return: context (2 sentences), talkingPoints (3), questions (3), prep (2).",
        ].join("\n"),
      });
      sections = [
        { heading: "What this is", items: [object.context] },
        {
          heading: "Who is in the room",
          items:
            others.length > 0
              ? others
                  .slice(0, 8)
                  .map((attendee) => attendee.name ?? attendee.email ?? "Guest")
              : ["Just you — protect the block and close the door."],
        },
        { heading: "Talking points", items: object.talkingPoints },
        { heading: "Questions to ask", items: object.questions },
        { heading: "Suggested prep", items: object.prep },
      ];
      usedModel = true;
    } catch {
      sections = fallbackSections;
    }
  }

  return {
    intent: "brief",
    headline: event.title,
    answer: `A short brief for ${fullDayLabel(new Date(event.start), timeZone)} at ${timeLabel(new Date(event.start), timeZone)}. Prepared from the invite only — nothing outside this meeting was used.`,
    slots: [],
    conflicts: [],
    brief: { eventId: event.id, sections },
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
  return buildOverview(input, timeZone);
}
