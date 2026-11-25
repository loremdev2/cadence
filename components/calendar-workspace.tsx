"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format, startOfWeek } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { AssistantIntent } from "@/lib/ai/assistant";
import { computeWeekStats } from "@/lib/scheduling";
import type {
  AiSlot,
  AssistantResult,
  CalEvent,
  CalendarMode,
  CalendarRange,
  Viewer,
} from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { CalendarView, type CalendarHandle } from "./calendar-view";
import { Brand, Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { DemoBanner } from "./demo-banner";
import { AssistantPanel, type ChatMessage } from "./assistant-panel";
import { MeetingPanel } from "./meeting-panel";
import { RightPanel, type PanelTab } from "./right-panel";

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function weekRange(anchor: Date): CalendarRange {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return { start: start.toISOString(), end: addDays(start, 7).toISOString() };
}

function titleFor(anchor: Date, view: "day" | "week") {
  if (view === "day") return format(anchor, "EEEE d MMMM");
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, "d")}–${format(end, "d MMMM yyyy")}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  }
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

export function CalendarWorkspace({ viewer }: { viewer: Viewer }) {
  const [mode, setMode] = useState<CalendarMode>(viewer.connected ? "live" : "demo");
  const [view, setView] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [range, setRange] = useState<CalendarRange>(() => weekRange(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>("assistant");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  const [brief, setBrief] = useState<AssistantResult | null>(null);
  const [briefEventId, setBriefEventId] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const calendarRef = useRef<CalendarHandle>(null);
  const [timeZone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    const bufferStart = new Date(new Date(range.start).getTime() - 21 * 86_400_000);
    const bufferEnd = new Date(new Date(range.end).getTime() + 21 * 86_400_000);
    const params = new URLSearchParams({
      mode,
      start: bufferStart.toISOString(),
      end: bufferEnd.toISOString(),
      tz: timeZone,
    });

    setLoading(true);
    setError(null);

    fetch(`/api/calendar/events?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload?.error ?? "The calendar could not be loaded. Try again.";
          const failure = new Error(message) as Error & { code?: string };
          failure.code = payload?.code ?? "unknown";
          throw failure;
        }
        setEvents(Array.isArray(payload?.events) ? payload.events : []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const failure = cause as Error & { code?: string };
        setEvents([]);
        setError({
          code: failure.code ?? "unknown",
          message: failure.message ?? "The calendar could not be loaded.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range.start, range.end, mode, timeZone, reloadToken]);

  const handleRangeChange = useCallback(
    (next: CalendarRange, nextAnchor: Date) => {
      setAnchor(nextAnchor);
      setRange((previous) =>
        previous.start === next.start && previous.end === next.end ? previous : next,
      );
    },
    [],
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId],
  );

  const stats = useMemo(
    () => computeWeekStats(events, range, timeZone),
    [events, range, timeZone],
  );

  const ask = useCallback(
    async (prompt: string, options?: { intent?: AssistantIntent; eventId?: string }) => {
      const value = prompt.trim();
      if (!value || pending) return;

      setMessages((previous) => [
        ...previous,
        { id: newId(), role: "user", text: value },
      ]);
      setPending(true);

      try {
        const response = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: value,
            mode,
            timeZone,
            view: range,
            events,
            eventId: options?.eventId ?? selectedId,
            intent: options?.intent ?? null,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "The assistant could not answer.");
        }
        const result = payload as AssistantResult;
        setMessages((previous) => [
          ...previous,
          { id: newId(), role: "assistant", result },
        ]);
        if (result.brief) {
          setBrief(result);
          setBriefEventId(result.brief.eventId);
          setSelectedId(result.brief.eventId);
        }
      } catch (cause) {
        setMessages((previous) => [
          ...previous,
          {
            id: newId(),
            role: "assistant",
            error: true,
            text:
              cause instanceof Error
                ? cause.message
                : "The assistant could not answer.",
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pending, mode, timeZone, range, events, selectedId],
  );

  const bookSlot = useCallback(
    async (slot: AiSlot, title: string) => {
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          title,
          start: slot.start,
          end: slot.end,
          timeZone,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not add the event.");
      }
      setReloadToken((token) => token + 1);
      calendarRef.current?.gotoDate(new Date(slot.start));
      return (payload?.htmlLink as string | null) ?? null;
    },
    [mode, timeZone],
  );

  const goLive = useCallback(() => {
    if (viewer.connected) {
      setMode("live");
      setSelectedId(null);
      return;
    }
    window.location.href = viewer.authConfigured
      ? "/auth/google/start?next=/"
      : "/login";
  }, [viewer.connected, viewer.authConfigured]);

  const prepareBrief = useCallback(
    async (event: CalEvent) => {
      setBriefLoading(true);
      setBriefError(null);
      setBriefEventId(event.id);
      try {
        const response = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `Prepare a brief for ${event.title}`,
            mode,
            timeZone,
            view: range,
            events,
            eventId: event.id,
            intent: "brief",
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "Could not prepare a brief.");
        }
        if (!payload?.brief) {
          throw new Error("Select a meeting with details on the invite and try again.");
        }
        setBrief(payload as AssistantResult);
      } catch (cause) {
        setBriefError(
          cause instanceof Error ? cause.message : "Could not prepare a brief.",
        );
      } finally {
        setBriefLoading(false);
      }
    },
    [mode, timeZone, range, events],
  );

  const handleSelectEvent = useCallback((id: string) => {
    setSelectedId(id);
    setTab("meeting");
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches) {
      setSheetOpen(true);
    }
  }, []);

  const openAssistant = useCallback(() => {
    setTab("assistant");
    setSheetOpen(true);
  }, []);

  const jumpTo = useCallback((iso: string) => {
    calendarRef.current?.gotoDate(new Date(iso));
  }, []);

  const switchMode = useCallback(() => {
    if (mode === "live") {
      setMode("demo");
      setSelectedId(null);
      return;
    }
    if (viewer.connected) {
      setMode("live");
      setSelectedId(null);
      return;
    }
    window.location.href = viewer.authConfigured
      ? "/auth/google/start?next=/"
      : "/login";
  }, [mode, viewer.connected, viewer.authConfigured]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  const activeBrief = brief && briefEventId === selectedEvent?.id ? brief : null;

  const panel = (className: string, onClose?: () => void) => (
    <RightPanel
      className={className}
      tab={tab}
      onTabChange={setTab}
      onClose={onClose}
      hasEvent={Boolean(selectedEvent)}
      assistant={
        <AssistantPanel
          messages={messages}
          pending={pending}
          selectedEvent={selectedEvent}
          mode={mode}
          canWrite={viewer.canWrite}
          onAsk={(prompt) => ask(prompt)}
          onJump={jumpTo}
          onBookSlot={bookSlot}
          onGoLive={goLive}
        />
      }
      meeting={
        <MeetingPanel
          event={selectedEvent}
          brief={activeBrief}
          briefLoading={briefLoading}
          briefError={briefError}
          onPrepare={prepareBrief}
        />
      }
    />
  );

  const reconnect =
    error &&
    ["needs_reconnect", "not_connected", "scope_missing"].includes(error.code);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-paper text-ink">
      <Sidebar
        viewer={viewer}
        mode={mode}
        stats={stats}
        periodLabel={view === "day" ? "This day" : "This week"}
        onOpenAssistant={openAssistant}
        onReviewConflicts={() => ask("Review this week for conflicts")}
        onSwitchMode={switchMode}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 lg:hidden">
          <Link href="/" aria-label="Cadence home">
            <Brand />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              aria-label="Settings"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Settings2 className="h-4 w-4" />
            </Link>
            <Button size="sm" onClick={openAssistant} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Ask
            </Button>
          </div>
        </div>

        <TopBar
          title={titleFor(anchor, view)}
          view={view}
          mode={mode}
          stats={stats}
          onViewChange={setView}
          onPrev={() => calendarRef.current?.prev()}
          onNext={() => calendarRef.current?.next()}
          onToday={() => calendarRef.current?.today()}
          onAsk={openAssistant}
        />

        {loading && <div className="h-0.5 w-full animate-pulse bg-spruce/30" />}

        {mode === "demo" && bannerOpen && (
          <DemoBanner
            authConfigured={viewer.authConfigured}
            onDismiss={() => setBannerOpen(false)}
          />
        )}

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 p-3 lg:p-4">
            <div className="h-full">
              {error ? (
                <div className="grid h-full place-items-center rounded-2xl border border-line bg-white p-6">
                  <div className="max-w-sm text-center">
                    <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#F8E9E2] text-clay">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <h2 className="mt-3 font-serif text-[21px]">
                      The calendar didn&apos;t load
                    </h2>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                      {error.message}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setReloadToken((token) => token + 1)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try again
                      </Button>
                      {mode === "live" && (
                        <Button size="sm" onClick={() => setMode("demo")}>
                          Use demo calendar
                        </Button>
                      )}
                      {reconnect && (
                        <a
                          href="/auth/google/start?next=/"
                          className={buttonVariants({ size: "sm", variant: "subtle" })}
                        >
                          Reconnect
                          <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <CalendarView
                  ref={calendarRef}
                  view={view}
                  events={events}
                  selectedId={selectedId}
                  loading={loading}
                  onEventClick={handleSelectEvent}
                  onRangeChange={handleRangeChange}
                />
              )}
            </div>
          </div>

          {panel("hidden w-[392px] shrink-0 xl:flex")}
        </div>
      </div>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[1px] xl:hidden"
          onClick={() => setSheetOpen(false)}
          role="presentation"
        >
          <div
            className="flex h-full w-full max-w-[430px] animate-slide-in flex-col bg-panel shadow-panel"
            onClick={(event) => event.stopPropagation()}
          >
            {panel("h-full border-l-0", () => setSheetOpen(false))}
          </div>
        </div>
      )}
    </div>
  );
}
