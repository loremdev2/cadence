import type { CalEvent, EventCategory } from "./types";
import {
  addCivilDays,
  isoDate,
  zonedParts as zonedPartsOf,
  zonedToUtc,
} from "./timezone";

export interface DemoAttendee {
  name: string;
  email: string;
}

export const DEMO_OWNER = {
  name: "Maya Chen",
  email: "maya@meridianlabs.com",
  role: "Head of Operations, Meridian Labs",
};

const PEOPLE = {
  priya: { name: "Priya Raman", email: "priya@meridianlabs.com" },
  marcus: { name: "Marcus Bell", email: "marcus@meridianlabs.com" },
  ana: { name: "Ana Duarte", email: "ana@meridianlabs.com" },
  tom: { name: "Tom Hale", email: "tom@meridianlabs.com" },
  sofia: { name: "Sofia Lind", email: "sofia@meridianlabs.com" },
  daniel: { name: "Daniel Okafor", email: "daniel@meridianlabs.com" },
  grace: { name: "Grace Kim", email: "grace@meridianlabs.com" },
  elena: { name: "Elena Rossi", email: "elena.rossi@heliosystems.com" },
  james: { name: "James Park", email: "james.park@vantage.io" },
  lena: { name: "Lena Fischer", email: "lena@northwind.co" },
};

type Spec = {
  day: number;
  start: string;
  minutes: number;
  title: string;
  category: EventCategory;
  location?: string;
  description?: string;
  people?: DemoAttendee[];
  recurring?: boolean;
  allDay?: boolean;
  hangout?: boolean;
};

const WEEK: Spec[] = [
  {
    day: 0,
    start: "09:00",
    minutes: 15,
    title: "Ops standup",
    category: "internal",
    location: "Zoom",
    recurring: true,
    hangout: true,
    people: [PEOPLE.priya, PEOPLE.marcus, PEOPLE.ana, PEOPLE.daniel],
    description:
      "Daily 15. Blockers, handoffs, and anything that needs a decision today.",
  },
  {
    day: 0,
    start: "10:00",
    minutes: 90,
    title: "Q4 planning deep-dive",
    category: "internal",
    location: "Room 4B · Juniper",
    people: [PEOPLE.priya, PEOPLE.tom, PEOPLE.marcus],
    description:
      "Walk through the Q4 operating plan: headcount, tooling spend, and the two bets we deferred from Q3. Priya wants a decision on the support automation budget. Tom is bringing the revised forecast and will push back on any spend without a revenue line.",
  },
  {
    day: 0,
    start: "12:00",
    minutes: 60,
    title: "Lunch & learn: incident review",
    category: "internal",
    location: "Cafeteria",
    people: [PEOPLE.daniel, PEOPLE.sofia],
    description:
      "Daniel walks through the November 12 outage. Focus on the alerting gap, not the individual fix.",
  },
  {
    day: 0,
    start: "14:00",
    minutes: 30,
    title: "1:1 — Priya",
    category: "internal",
    location: "Zoom",
    recurring: true,
    hangout: true,
    people: [PEOPLE.priya],
    description:
      "Weekly 1:1. Priya's topics: Q4 staffing, the support automation vendor, and her holiday coverage plan.",
  },
  {
    day: 0,
    start: "15:00",
    minutes: 60,
    title: "Northwind vendor review",
    category: "meeting",
    location: "Zoom",
    hangout: true,
    people: [PEOPLE.lena, PEOPLE.tom],
    description:
      "Quarterly review with Northwind. Renewal is up in January. They want to move us to the enterprise tier (+18%). Ask for the volume discount they offered Helio and push for a 30-day pilot of the new routing module. Tom wants the total cost of ownership line before we agree to anything.",
  },
  {
    day: 0,
    start: "16:30",
    minutes: 90,
    title: "Focus: pricing model",
    category: "focus",
    description:
      "Heads-down. Update the pricing model with the new seat tiers and send Tom a first pass before Wednesday.",
  },

  {
    day: 1,
    start: "08:30",
    minutes: 15,
    title: "Ops standup",
    category: "internal",
    location: "Zoom",
    recurring: true,
    hangout: true,
    people: [PEOPLE.priya, PEOPLE.marcus, PEOPLE.ana, PEOPLE.daniel],
    description: "Daily 15. Blockers and handoffs.",
  },
  {
    day: 1,
    start: "10:00",
    minutes: 60,
    title: "Customer escalation — Helio",
    category: "meeting",
    location: "Zoom",
    hangout: true,
    people: [PEOPLE.elena, PEOPLE.sofia],
    description:
      "Helio's routing rules started dropping tickets after our last release. Elena needs a timeline today. Sofia has the reproduction; we owe them a written remediation plan by end of week. Come with the rollback option and a date, not a status update.",
  },
  {
    day: 1,
    start: "10:30",
    minutes: 60,
    title: "Board deck review",
    category: "internal",
    location: "Room 4B · Juniper",
    people: [PEOPLE.tom, PEOPLE.priya],
    description:
      "Tom's second pass on the board narrative. We need the retention chart recut and the hiring plan reconciled with finance before Thursday.",
  },
  {
    day: 1,
    start: "13:00",
    minutes: 45,
    title: "Design review: scheduling v2",
    category: "internal",
    location: "Figma room",
    people: [PEOPLE.ana, PEOPLE.marcus],
    description:
      "Ana presents the new week view. Open questions: how we show focus time, and whether conflicts get an inline fix affordance.",
  },
  {
    day: 1,
    start: "15:00",
    minutes: 120,
    title: "Focus: support automation brief",
    category: "focus",
    description:
      "Write the one-pager for the support automation vendor decision. Priya needs it before Thursday's roadmap review.",
  },
  {
    day: 1,
    start: "17:00",
    minutes: 30,
    title: "Weekly metrics sync",
    category: "internal",
    location: "Zoom",
    recurring: true,
    hangout: true,
    people: [PEOPLE.daniel, PEOPLE.tom],
    description:
      "Daniel's dashboard review. Watch the support backlog trend and the new trial activation number.",
  },

  {
    day: 2,
    start: "00:00",
    minutes: 0,
    title: "Quarter close — no external meetings",
    category: "personal",
    allDay: true,
    description:
      "Finance locks the quarter today. Hold internal-only meetings and route anything external to next week.",
  },
  {
    day: 2,
    start: "09:00",
    minutes: 120,
    title: "Interview loop — ops lead",
    category: "internal",
    location: "Room 2A",
    people: [PEOPLE.grace, PEOPLE.marcus],
    description:
      "Two back-to-back interviews for the ops lead role. Focus on systems thinking and how they handle a queue backlog. Scorecards due to Grace by Friday.",
  },
  {
    day: 2,
    start: "12:00",
    minutes: 30,
    title: "1:1 — Marcus",
    category: "internal",
    location: "Zoom",
    recurring: true,
    hangout: true,
    people: [PEOPLE.marcus],
    description:
      "Marcus wants to talk about on-call rotation and the platform hire. He is carrying too much of the release load and it is starting to show.",
  },
  {
    day: 2,
    start: "13:30",
    minutes: 60,
    title: "Partner sync — Vantage",
    category: "meeting",
    location: "Zoom",
    hangout: true,
    people: [PEOPLE.james, PEOPLE.priya],
    description:
      "Vantage integration status. James will ask about the API rate limits again. We agreed on 500 req/min in the last call — confirm it in writing.",
  },
  {
    day: 2,
    start: "15:00",
    minutes: 45,
    title: "Support backlog triage",
    category: "internal",
    location: "Zoom",
    hangout: true,
    people: [PEOPLE.sofia],
    description:
      "Sofia's proposal to split the backlog by severity. Decide whether we pause new automation work to clear the queue.",
  },
  {
    day: 2,
    start: "17:30",
    minutes: 60,
    title: "Strategy review with Tom",
    category: "internal",
    location: "Room 4B · Juniper",
    people: [PEOPLE.tom],
    description:
      "Late slot Tom booked. Q4 spend versus the hiring plan, and whether we delay the analytics hire to Q1.",
  },

  {
    day: 3,
    start: "09:00",
    minutes: 15,
    title: "Ops standup",
    category: "internal",
    location: "Zoom",
    recurring: true,
    hangout: true,
    people: [PEOPLE.priya, PEOPLE.marcus, PEOPLE.ana, PEOPLE.daniel],
    description: "Daily 15.",
  },
  {
    day: 3,
    start: "10:00",
    minutes: 90,
    title: "Roadmap review — H1",
    category: "internal",
    location: "Room 4B · Juniper",
    people: [PEOPLE.priya, PEOPLE.marcus, PEOPLE.ana, PEOPLE.tom],
    description:
      "Lock the H1 roadmap. Priya is bringing the support automation one-pager. Tom will push back on anything without a revenue line. Decision needed on the analytics hire.",
  },
  {
    day: 3,
    start: "12:30",
    minutes: 60,
    title: "Lunch with Ana",
    category: "personal",
    location: "Café Mila",
    people: [PEOPLE.ana],
    description: "Off-site catch-up. Ana is deciding whether to take the design lead role.",
  },
  {
    day: 3,
    start: "14:00",
    minutes: 60,
    title: "Customer onboarding — Vantage",
    category: "meeting",
    location: "Zoom",
    hangout: true,
    people: [PEOPLE.james, PEOPLE.sofia],
    description:
      "Kickoff for Vantage's rollout. They want a 30-day plan and a named contact for escalations. Sofia can own the technical track.",
  },

  {
    day: 4,
    start: "09:00",
    minutes: 15,
    title: "Ops standup",
    category: "internal",
    location: "Zoom",
    recurring: true,
    hangout: true,
    people: [PEOPLE.priya, PEOPLE.marcus, PEOPLE.ana, PEOPLE.daniel],
    description: "Daily 15.",
  },
  {
    day: 4,
    start: "10:00",
    minutes: 45,
    title: "All-hands",
    category: "internal",
    location: "Main hall",
    recurring: true,
    people: [PEOPLE.grace, PEOPLE.priya, PEOPLE.tom],
    description:
      "Company all-hands. Ops segment is three minutes: backlog trend, the Helio remediation, and the ops lead hire.",
  },
  {
    day: 4,
    start: "11:00",
    minutes: 45,
    title: "Weekly retro",
    category: "internal",
    location: "Room 2A",
    recurring: true,
    people: [PEOPLE.marcus, PEOPLE.ana, PEOPLE.daniel, PEOPLE.sofia],
    description:
      "What slowed us down this week. Likely themes: the Helio escalation and the interview loop pulling Marcus off release work.",
  },
  {
    day: 4,
    start: "14:00",
    minutes: 180,
    title: "Focus: H1 operating plan",
    category: "focus",
    description:
      "Draft the H1 operating plan narrative from Thursday's decisions. Needs to be with Tom by Monday morning.",
  },
];

/**
 * Deterministic sample calendar anchored to the viewer's local week.
 * Generates events for any range so navigation always has content.
 */
export function demoEventsForRange(
  startISO: string,
  endISO: string,
  timeZone: string,
): CalEvent[] {
  const rangeStart = new Date(startISO).getTime();
  const rangeEnd = new Date(endISO).getTime();
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return [];

  const startParts = zonedPartsOf(new Date(rangeStart), timeZone);
  const startCivilMs = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const dow = new Date(startCivilMs).getUTCDay();
  const mondayCivilMs = startCivilMs - ((dow + 6) % 7) * 86_400_000;
  const events: CalEvent[] = [];

  for (let week = 0; week < 30; week += 1) {
    const weekStartMs = mondayCivilMs + week * 7 * 86_400_000;
    if (weekStartMs > rangeEnd) break;

    WEEK.forEach((spec, index) => {
      const dayCivilMs = weekStartMs + spec.day * 86_400_000;
      const dayCivil = new Date(dayCivilMs);
      const civil = {
        year: dayCivil.getUTCFullYear(),
        month: dayCivil.getUTCMonth() + 1,
        day: dayCivil.getUTCDate(),
      };
      const [hour, minute] = spec.start.split(":").map(Number);
      const startAt = zonedToUtc(civil, timeZone, hour, minute);
      const endAt = spec.allDay
        ? zonedToUtc(addCivilDays(civil, 1), timeZone)
        : new Date(startAt.getTime() + spec.minutes * 60_000);

      if (endAt.getTime() < rangeStart - 86_400_000 || startAt.getTime() > rangeEnd + 86_400_000) {
        return;
      }

      const weekKey = isoDate({
        year: new Date(weekStartMs).getUTCFullYear(),
        month: new Date(weekStartMs).getUTCMonth() + 1,
        day: new Date(weekStartMs).getUTCDate(),
      });
      events.push({
        id: `demo-${weekKey}-${index}`,
        title: spec.title,
        start: startAt.toISOString(),
        end: endAt.toISOString(),
        allDay: Boolean(spec.allDay),
        description: spec.description,
        location: spec.location,
        attendees: spec.people?.map((person) => ({
          ...person,
          responseStatus: "accepted",
        })),
        organizer: DEMO_OWNER.email,
        category: spec.category,
        recurring: spec.recurring,
        hangoutLink: spec.hangout ? "https://meet.google.com/demo-cadence" : undefined,
        status: "confirmed",
      });
    });
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}
