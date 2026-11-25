"use client";

import { format } from "date-fns";
import {
  CalendarClock,
  Clock,
  ExternalLink,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import type { AssistantResult, CalEvent } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface MeetingPanelProps {
  event: CalEvent | null;
  brief: AssistantResult | null;
  briefLoading: boolean;
  briefError: string | null;
  onPrepare: (event: CalEvent) => void;
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

export function MeetingPanel({
  event,
  brief,
  briefLoading,
  briefError,
  onPrepare,
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
                        section.heading === "What this is" && "text-[12px]",
                      )}
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C9C1B2]" />
                      <span>{item}</span>
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
              Suggestions only. Cadence cannot edit this event or invite anyone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
