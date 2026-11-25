"use client";

import { format } from "date-fns";
import {
  CalendarClock,
  Clock,
  ExternalLink,
  MapPin,
  RefreshCw,
  Shuffle,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import type {
  AssistantResult,
  BriefSource,
  CalEvent,
  RescheduleOption,
  ReschedulePreview,
} from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface MeetingPanelProps {
  event: CalEvent | null;
  brief: AssistantResult | null;
  briefLoading: boolean;
  briefError: string | null;
  reschedule: ReschedulePreview | null;
  rescheduleLoading: boolean;
  rescheduleError: string | null;
  moveNotice: string | null;
  movingStart: string | null;
  live: boolean;
  canMove: boolean;
  onPrepare: (event: CalEvent) => void;
  onPreviewMove: (event: CalEvent) => void;
  onMove: (event: CalEvent, option: RescheduleOption) => void;
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const categoryLabel: Record<CalEvent["category"], string> = {
  meeting: "External meeting",
  internal: "Internal",
  focus: "Focus",
  personal: "Personal",
};

const sourceLabel: Record<BriefSource, string> = {
  invite: "invite",
  attendees: "guest list",
  calendar: "calendar",
  inferred: "Cadence",
};

export function MeetingPanel({
  event,
  brief,
  briefLoading,
  briefError,
  reschedule,
  rescheduleLoading,
  rescheduleError,
  moveNotice,
  movingStart,
  live,
  canMove,
  onPrepare,
  onPreviewMove,
  onMove,
}: MeetingPanelProps) {
  if (!event) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F1EFE7] text-muted">
          <CalendarClock className="h-4 w-4" />
        </span>
        <h2 className="mt-3 font-serif text-[19px]">Select a meeting</h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          Pick any event on the calendar to see the invite details and prepare a short
          brief from what is actually on it.
        </p>
      </div>
    );
  }

  const start = new Date(event.start);
  const end = new Date(event.end);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const others = (event.attendees ?? []).filter((attendee) => !attendee.self);
  const sections = brief?.brief?.eventId === event.id ? brief.brief.sections : null;

  return (
    <div className="cadence-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral">{categoryLabel[event.category]}</Badge>
        {event.recurring && <Badge variant="outline">recurring</Badge>}
        {event.allDay && <Badge variant="outline">all-day</Badge>}
      </div>

      <h2 className="mt-2 font-serif text-[23px] leading-tight">{event.title}</h2>

      <div className="mt-2 space-y-1.5 text-[11.5px] text-ink-soft">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted" />
          <span>
            {format(start, "EEEE d MMMM")} ·{" "}
            {event.allDay
              ? "All day"
              : `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`}
            {!event.allDay && (
              <span className="text-muted"> · {durationLabel(minutes)}</span>
            )}
          </span>
        </div>
        {event.location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted" />
            <span>{event.location}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted" />
          <span>
            {others.length === 0
              ? "Just you"
              : `${others.length} ${others.length === 1 ? "guest" : "guests"}`}
          </span>
        </div>
      </div>

      {(event.hangoutLink || event.htmlLink) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {event.hangoutLink && (
            <a
              href={event.hangoutLink}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "secondary", size: "xs" })}
            >
              <Video className="h-3 w-3" />
              Join
            </a>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "xs" })}
            >
              <ExternalLink className="h-3 w-3" />
              Open in Google
            </a>
          )}
        </div>
      )}

      {event.description && (
        <div className="mt-4 rounded-xl border border-line bg-[#FCFBF8] p-3 text-[11.5px] leading-relaxed text-ink-soft">
          <p className="whitespace-pre-line">{event.description}</p>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
            Attendees
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {others.slice(0, 10).map((attendee, index) => (
              <li
                key={`${attendee.email ?? attendee.name ?? "guest"}-${index}`}
                className="flex items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#EDEFE8] text-[8.5px] font-semibold text-[#4B5B50]">
                  {initials(attendee.name ?? attendee.email ?? "?")}
                </span>
                <span className="max-w-[150px] truncate text-[10.5px] text-ink-soft">
                  {attendee.name ?? attendee.email}
                </span>
                {attendee.responseStatus === "declined" && (
                  <span className="text-[8.5px] text-clay">declined</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
            Prep brief
          </h3>
          {brief && brief.brief?.eventId === event.id && (
            <span className="text-[9px] text-muted">
              {brief.usedModel ? "written from the invite" : "heuristic mode"}
            </span>
          )}
        </div>

        {!sections && !briefLoading && (
          <>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              A short brief built only from this invite: context, who is in the room,
              what to prepare, and the questions worth asking.
            </p>
            <Button
              size="sm"
              className="mt-2.5 w-full gap-1.5"
              onClick={() => onPrepare(event)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Prepare brief
            </Button>
          </>
        )}

        {briefLoading && (
          <div className="mt-2.5 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {briefError && !briefLoading && (
          <div className="mt-2.5 rounded-lg border border-[#EED9CF] bg-[#FDF3EE] p-2.5 text-[11px] leading-relaxed text-[#7C452C]">
            {briefError}
          </div>
        )}

        {sections && !briefLoading && (
          <div className="mt-3 space-y-3.5">
            {brief?.brief?.insufficient && (
              <p className="rounded-lg border border-[#EFE2C6] bg-[#FBF3E1] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#7A5A1E]">
                This invite has no agenda or description, so there is not enough
                information for a real summary. Lines marked “Cadence” are general
                preparation, not details from the invite.
              </p>
            )}
            {sections.map((section) => (
              <section key={section.heading}>
                <h4 className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {section.heading}
                </h4>
                <ul className="mt-1.5 space-y-1.5">
                  {section.items.map((item, index) => (
                    <li
                      key={index}
                      className={cn(
                        "flex gap-1.5 text-[11.5px] leading-relaxed text-ink-soft",
                        section.heading === "Purpose" && "text-[12px]",
                      )}
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C9C1B2]" />
                      <span className="min-w-0">{item.text}</span>
                      <span
                        className={cn(
                          "mt-0.5 ml-auto shrink-0 rounded-full border px-1.5 py-[1px] text-[8px] uppercase tracking-[0.08em]",
                          item.source === "inferred"
                            ? "border-[#E2DCCB] text-[#8A8170]"
                            : "border-[#CFE0D2] bg-[#F3F7F2] text-[#3E6450]",
                        )}
                        title={
                          item.source === "inferred"
                            ? "Written by Cadence from the invite"
                            : `Taken from the ${sourceLabel[item.source]}`
                        }
                      >
                        {sourceLabel[item.source]}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <Button
              variant="secondary"
              size="xs"
              className="w-full gap-1.5"
              onClick={() => onPrepare(event)}
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </Button>
            <p className="text-[9.5px] leading-relaxed text-muted">
              Every line is labelled with where it came from. Nothing outside this
              invite was used.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
            What if?
          </h3>
          {reschedule && (
            <span className="text-[9px] text-muted">nothing moves until you confirm</span>
          )}
        </div>

        {moveNotice && (
          <p className="mt-2 rounded-lg bg-[#F1F7F2] px-2.5 py-2 text-[10.5px] leading-relaxed text-[#2F6449]">
            {moveNotice}
          </p>
        )}

        {!reschedule && !rescheduleLoading && (
          <>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              See where this meeting could move, and what each option would fix or
              create.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2.5 w-full gap-1.5"
              onClick={() => onPreviewMove(event)}
            >
              <Shuffle className="h-3.5 w-3.5" />
              Preview alternatives
            </Button>
            {!live && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                Previews work on the demo week; switching to your live calendar lets
                you confirm a move.
              </p>
            )}
          </>
        )}

        {rescheduleLoading && (
          <div className="mt-2.5 space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {rescheduleError && !rescheduleLoading && (
          <div className="mt-2.5 rounded-lg border border-[#EED9CF] bg-[#FDF3EE] p-2.5 text-[11px] leading-relaxed text-[#7C452C]">
            {rescheduleError}
          </div>
        )}

        {reschedule && !rescheduleLoading && (
          <div className="mt-2.5 space-y-2">
            <p className="text-[10.5px] text-muted">
              Currently {reschedule.currentLabel}
            </p>
            {reschedule.options.length === 0 && (
              <p className="rounded-lg border border-line bg-[#FCFBF8] px-2.5 py-2 text-[11px] leading-relaxed text-muted">
                No clean alternative inside your working hours. Shortening the meeting
                or widening the dates would give me options.
              </p>
            )}
            {reschedule.options.map((option) => (
              <div
                key={option.start}
                className="rounded-xl border border-line bg-white p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted">
                    {option.dayLabel}
                  </span>
                  <span className="text-[9.5px] text-muted">{option.minutes} min</span>
                </div>
                <div className="mt-0.5 text-[13px] font-semibold tabular tracking-tight">
                  {option.timeLabel}
                </div>
                <div className="mt-1 space-y-1">
                  {option.fixes.map((fix) => (
                    <p
                      key={`fix-${fix}`}
                      className="text-[10.5px] leading-snug text-[#2F6449]"
                    >
                      Fixes {fix}
                    </p>
                  ))}
                  {option.creates.map((created) => (
                    <p
                      key={`create-${created}`}
                      className="text-[10.5px] leading-snug text-clay"
                    >
                      Creates {created}
                    </p>
                  ))}
                  {option.fixes.length === 0 && option.creates.length === 0 && (
                    <p className="text-[10.5px] leading-snug text-muted">
                      No other collisions either way.
                    </p>
                  )}
                </div>
                {canMove ? (
                  <Button
                    size="xs"
                    className="mt-2 w-full"
                    disabled={movingStart === option.start}
                    onClick={() => onMove(event, option)}
                  >
                    {movingStart === option.start ? "Moving…" : "Move here"}
                  </Button>
                ) : live ? (
                  <a
                    href="/auth/google/start?next=/calendar"
                    className="mt-2 block rounded-lg bg-[#FDF4EF] px-2 py-1.5 text-[10.5px] leading-snug text-[#7C452C] underline decoration-[#E9D3C6] underline-offset-2"
                  >
                    Your connection is read-only. Reconnect to approve moving events.
                  </a>
                ) : (
                  <p className="mt-2 text-[10px] text-muted">
                    The demo calendar is read-only. Switch to your live calendar to move
                    it.
                  </p>
                )}
              </div>
            ))}
            <p className="text-[9.5px] leading-relaxed text-muted">
              A move changes only the time. The title, guests and description stay as
              they are, and Google sends no notifications.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
