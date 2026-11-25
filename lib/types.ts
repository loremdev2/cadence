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

export interface BriefSection {
  heading: string;
  items: string[];
}

export interface AssistantResult {
  intent: "find_time" | "brief" | "conflicts" | "overview";
  headline: string;
  answer: string;
  slots: AiSlot[];
  conflicts: AiConflict[];
  brief: { eventId: string; sections: BriefSection[] } | null;
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
