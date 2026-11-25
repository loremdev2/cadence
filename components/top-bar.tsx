"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LayoutGrid,
  Sparkles,
  Rows3,
} from "lucide-react";
import type { CalendarMode, WeekStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

interface TopBarProps {
  title: string;
  view: "day" | "week";
  mode: CalendarMode;
  stats: WeekStats;
  onViewChange: (view: "day" | "week") => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAsk: () => void;
  onTutorial: () => void;
}

function Dot() {
  return <span className="text-line-strong">·</span>;
}

export function TopBar({
  title,
  view,
  mode,
  stats,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onAsk,
  onTutorial,
}: TopBarProps) {
  return (
    <header className="border-b border-line px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div data-tour="calendar" className="inline-flex rounded-lg border border-line bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => onViewChange("day")}
                aria-pressed={view === "day"}
                className={cn(
                  "flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10.5px] font-medium transition-colors",
                  view === "day"
                    ? "bg-[#EFEDE5] text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                <Rows3 className="h-3 w-3" />
                Day
              </button>
              <button
                type="button"
                onClick={() => onViewChange("week")}
                aria-pressed={view === "week"}
                className={cn(
                  "flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10.5px] font-medium transition-colors",
                  view === "week"
                    ? "bg-[#EFEDE5] text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                <LayoutGrid className="h-3 w-3" />
                Week
              </button>
            </div>
            <span className="hidden text-[10.5px] text-muted sm:inline">
              {mode === "demo" ? "sample data" : "your calendar"}
            </span>
          </div>

          <h1 className="mt-2.5 truncate font-serif text-[27px] leading-tight tracking-[-0.01em] lg:text-[31px]">
            {title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
            <span>{stats.meetingCount} meetings</span>
            <Dot />
            <span>{stats.meetingHours}h booked</span>
            <Dot />
            <span className={cn(stats.conflicts > 0 && "text-clay")}>
              {stats.conflicts} {stats.conflicts === 1 ? "conflict" : "conflicts"}
            </span>
            <Dot />
            <span>{stats.focusHours}h focus</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          <Button
            variant="secondary"
            size="icon"
            onClick={onTutorial}
            aria-label="Open Cadence tutorial"
            title="How Cadence works"
          >
            <CircleHelp className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={onToday} className="hidden sm:inline-flex">
            Today
          </Button>
          <div className="flex items-center overflow-hidden rounded-lg border border-line bg-white shadow-sm">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous range"
              className="grid h-8 w-8 place-items-center text-ink-soft transition-colors hover:bg-[#F6F3EB]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="h-8 w-px bg-line" />
            <button
              type="button"
              onClick={onNext}
              aria-label="Next range"
              className="grid h-8 w-8 place-items-center text-ink-soft transition-colors hover:bg-[#F6F3EB]"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button
            size="sm"
            data-tour="assistant-entry"
            onClick={onAsk}
            className="ml-0.5 gap-1.5 xl:hidden"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
