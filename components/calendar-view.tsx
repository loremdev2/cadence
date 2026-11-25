"use client";

import dynamic from "next/dynamic";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { CalendarApi } from "@fullcalendar/core";
import type { CalEvent } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

const CalendarInner = dynamic(() => import("./calendar-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-full rounded-xl border border-line bg-white p-4">
      <div className="mb-4 grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-9" />
        ))}
      </div>
      <Skeleton className="h-[calc(100%-3rem)] w-full" />
    </div>
  ),
});

export interface CalendarHandle {
  prev: () => void;
  next: () => void;
  today: () => void;
  gotoDate: (date: Date) => void;
  changeView: (view: "day" | "week") => void;
}

interface CalendarViewProps {
  view: "day" | "week";
  events: CalEvent[];
  selectedId: string | null;
  loading?: boolean;
  onEventClick: (id: string) => void;
  onRangeChange: (range: { start: string; end: string }, anchor: Date) => void;
}

export const CalendarView = forwardRef<CalendarHandle, CalendarViewProps>(
  function CalendarView(
    { view, events, selectedId, loading, onEventClick, onRangeChange },
    ref,
  ) {
    const apiRef = useRef<CalendarApi | null>(null);
    const appliedView = useRef<"day" | "week">(view);

    const handleApi = useCallback((api: CalendarApi | null) => {
      apiRef.current = api;
    }, []);

    useImperativeHandle(ref, () => ({
      prev: () => apiRef.current?.prev(),
      next: () => apiRef.current?.next(),
      today: () => apiRef.current?.today(),
      gotoDate: (date: Date) => apiRef.current?.gotoDate(date),
      changeView: (next: "day" | "week") =>
        apiRef.current?.changeView(next === "day" ? "timeGridDay" : "timeGridWeek"),
    }));

    useEffect(() => {
      if (appliedView.current === view) return;
      appliedView.current = view;
      apiRef.current?.changeView(view === "day" ? "timeGridDay" : "timeGridWeek");
    }, [view]);

    return (
      <div className="relative h-full min-h-0">
        <CalendarInner
          view={view}
          events={events}
          selectedId={selectedId}
          onEventClick={onEventClick}
          onRangeChange={onRangeChange}
          onApi={handleApi}
        />
        {loading && (
          <div className="pointer-events-none absolute right-4 top-3 rounded-full border border-line bg-white/95 px-2.5 py-1 text-[9.5px] uppercase tracking-[0.12em] text-muted shadow-sm">
            Loading
          </div>
        )}
      </div>
    );
  },
);
