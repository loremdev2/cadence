"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  CalendarApi,
  DateSelectArg,
  DatesSetArg,
  EventContentArg,
  EventMountArg,
  DayHeaderContentArg,
} from "@fullcalendar/core";
import { format, isSameDay } from "date-fns";
import type { CalEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CalendarInnerProps {
  view: "day" | "week";
  events: CalEvent[];
  selectedId: string | null;
  onEventClick: (id: string) => void;
  onRangeChange: (range: { start: string; end: string }, anchor: Date) => void;
  onApi: (api: CalendarApi | null) => void;
}

const plugins = [timeGridPlugin, dayGridPlugin, interactionPlugin];

function CalendarInner({
  view,
  events,
  selectedId,
  onEventClick,
  onRangeChange,
  onApi,
}: CalendarInnerProps) {
  const ref = useRef<FullCalendar>(null);

  useEffect(() => {
    onApi(ref.current?.getApi() ?? null);
    return () => onApi(null);
  }, [onApi]);

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        extendedProps: { event },
      })),
    [events],
  );

  // FullCalendar's React wrapper flushes synchronously inside its own lifecycle.
  // Updating parent state from `datesSet` would re-render inside that window and
  // React 19 rejects it ("flushSync was called from inside a lifecycle method"),
  // so the range update is pushed to the next macrotask.
  const handleDatesSet = useCallback(
    (info: DatesSetArg) => {
      const range = { start: info.start.toISOString(), end: info.end.toISOString() };
      const anchor = info.view.currentStart;
      window.setTimeout(() => onRangeChange(range, anchor), 0);
    },
    [onRangeChange],
  );

  // Attached directly to the event element: FullCalendar's React wrapper does
  // not reliably forward `eventClick` here, and this also gives the chip a
  // keyboard affordance.
  const handleEventMount = useCallback(
    (info: EventMountArg) => {
      const el = info.el as HTMLElement;
      el.style.cursor = "pointer";
      const open = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        onEventClick(info.event.id);
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === "Enter" || key === " ") open(event);
      });
    },
    [onEventClick],
  );

  const handleDayHeader = useCallback((arg: DayHeaderContentArg) => {
    const today = isSameDay(arg.date, new Date());
    const weekend = arg.date.getDay() === 0 || arg.date.getDay() === 6;
    return (
      <div className="flex flex-col items-center gap-0.5 py-2">
        <span
          className={cn(
            "text-[9.5px] font-semibold uppercase tracking-[0.16em]",
            weekend ? "text-[#A9A292]" : "text-[#948E7E]",
          )}
        >
          {format(arg.date, "EEE")}
        </span>
        <span
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
            today ? "bg-spruce text-[#F7F5EF]" : "text-[#3A372F]",
          )}
        >
          {format(arg.date, "d")}
        </span>
      </div>
    );
  }, []);

  const handleEventContent = useCallback(
    (arg: EventContentArg) => {
      const event = arg.event.extendedProps.event as CalEvent;
      const allDay = arg.event.allDay;
      const start = arg.event.start;
      const end = arg.event.end;
      const minutes = start && end ? (end.getTime() - start.getTime()) / 60_000 : 0;
      const visibleAttendees = (event.attendees ?? []).filter((person) => !person.self);
      return (
        <div
          className={cn(
            "cal-chip",
            `cal-chip--${event.category}`,
            allDay && "cal-chip--allday",
            selectedId === event.id && "cal-chip--selected",
          )}
        >
          {!allDay && start && (
            <span className="cal-chip__time">{format(start, "HH:mm")}</span>
          )}
          <span className="cal-chip__title">{event.title}</span>
          {!allDay && minutes >= 45 && visibleAttendees.length > 0 && (
            <span className="cal-chip__meta">
              {visibleAttendees.length} {visibleAttendees.length === 1 ? "person" : "people"}
              {event.recurring ? " · recurring" : ""}
            </span>
          )}
        </div>
      );
    },
    [selectedId],
  );

  const now = new Date();
  const scrollHour = Math.max(7, Math.min(20, now.getHours() - 1));

  return (
    <div className="h-full min-h-0">
      <FullCalendar
        ref={ref}
        plugins={plugins}
        initialView={view === "day" ? "timeGridDay" : "timeGridWeek"}
        headerToolbar={false}
        firstDay={1}
        height="100%"
        expandRows
        stickyHeaderDates
        nowIndicator
        allDaySlot
        allDayText="all-day"
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        scrollTime={`${String(scrollHour).padStart(2, "0")}:00:00`}
        dayMaxEvents={2}
        dayMaxEventRows={2}
        eventDisplay="block"
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        noEventsText="No events in this range"
        events={calendarEvents}
        datesSet={handleDatesSet}
        eventDidMount={handleEventMount}
        dayHeaderContent={handleDayHeader}
        eventContent={handleEventContent}
        selectable={false}
      />
    </div>
  );
}

export default memo(CalendarInner);
