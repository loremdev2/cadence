export type EventCategory = "meeting" | "internal" | "focus" | "personal";

export interface Attendee {
  email?: string;
  name?: string;
  self?: boolean;
  responseStatus?: string;
  organizer?: boolean;
}

export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string;
  location?: string;
  attendees?: Attendee[];
  organizer?: string;
  category: EventCategory;
  recurring?: boolean;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
}

export interface CalendarRange {
  start: string;
  end: string;
}

export type CalendarMode = "demo" | "live";

export interface Viewer {
  authConfigured: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  connected: boolean;
  /** Stored grant includes write access, so events can be added. */
  canWrite: boolean;
  connectionStatus: string | null;
  googleEmail: string | null;
  connectedAt: string | null;
  scopes: string[];
  aiConfigured: boolean;
  aiModel: string;
  storageConfigured: boolean;
}

export interface AiSlot {
  start: string;
  end: string;
  minutes: number;
  dayLabel: string;
  timeLabel: string;
  score: number;
  reasons: string[];
}

/** Where a brief line came from, so nothing reads as invented. */
export type BriefSource = "invite" | "attendees" | "calendar" | "inferred";

export interface BriefItem {
  text: string;
  source: BriefSource;
}

export interface BriefSection {
  heading: string;
  items: BriefItem[];
}

export interface BriefResult {
  eventId: string;
  sections: BriefSection[];
  /** True when the invite carried no description, so the brief is generic. */
  insufficient: boolean;
}

/** A candidate time for an existing event, with what the move would change. */
export interface RescheduleOption extends AiSlot {
  /** Conflicts this move would remove. */
  fixes: string[];
  /** Conflicts this move would introduce. */
  creates: string[];
}

export interface ReschedulePreview {
  eventId: string;
  currentLabel: string;
  options: RescheduleOption[];
}

export interface EventDraft {
  title: string;
  agenda: string;
  description: string;
  location: string;
  attendees: string[];
  requestedDate: string | null;
  requestedPeriod: "morning" | "afternoon" | "evening" | null;
  /** Exact requested or selected start, before the draft is confirmed. */
  start: string | null;
  durationMinutes: number | null;
  status: "needs_duration" | "choose_time" | "confirm";
  options: AiSlot[];
  note: string | null;
}

/** Personal scheduling rules, stored per browser and applied to slot ranking. */
export interface SchedulingPreferences {
  workdayStart: number;
  workdayEnd: number;
  lunchStart: number;
  lunchEnd: number;
  bufferMinutes: number;
  focusBlockMinutes: number;
  preferMornings: boolean;
  protectLunch: boolean;
  allowWeekends: boolean;
}

export type ConflictSeverity = "high" | "medium" | "low";

export interface AiConflict {
  id: string;
  severity: ConflictSeverity;
  type:
    | "overlap"
    | "back_to_back"
    | "overloaded"
    | "no_focus"
    | "outside_hours";
  title: string;
  detail: string;
  suggestion: string;
  eventIds: string[];
}

export type AssistantIntent =
  | "find_time"
  | "brief"
  | "conflicts"
  | "overview"
  | "week_plan"
  | "reschedule"
  | "create_event";

export interface AssistantResult {
  intent: AssistantIntent;
  headline: string;
  answer: string;
  slots: AiSlot[];
  conflicts: AiConflict[];
  brief: BriefResult | null;
  reschedule: ReschedulePreview | null;
  eventDraft?: EventDraft | null;
  usedModel: boolean;
  model: string | null;
}

export interface WeekStats {
  meetingHours: number;
  meetingCount: number;
  focusHours: number;
  conflicts: number;
  busiestDay: string | null;
}
