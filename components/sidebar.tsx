"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { CalendarMode, Viewer, WeekStats } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[10px] bg-spruce text-[#F7F5EF] shadow-sm",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      >
        <path d="M6.5 6v12M12 9v6M17.5 3.5v17" />
      </svg>
    </div>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      {!compact && (
        <div className="leading-none">
          <div className="font-serif text-[19px] tracking-[-0.01em]">Cadence</div>
          <div className="mt-1 text-[8.5px] uppercase tracking-[0.2em] text-muted">
            calendar intelligence
          </div>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  viewer: Viewer;
  mode: CalendarMode;
  stats: WeekStats;
  periodLabel: string;
  onOpenAssistant: () => void;
  onReviewConflicts: () => void;
  onSwitchMode: () => void;
}

export function Sidebar({
  viewer,
  mode,
  stats,
  periodLabel,
  onOpenAssistant,
  onReviewConflicts,
  onSwitchMode,
}: SidebarProps) {
  const pathname = usePathname();

  const connectHref = viewer.authConfigured
    ? "/auth/google/start?next=/"
    : "/login";

  const navItem = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors",
      active
        ? "bg-white text-ink shadow-sm ring-1 ring-line"
        : "text-ink-soft hover:bg-white/70 hover:text-ink",
    );

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-line bg-[#F5F2EA] px-3 pb-3 pt-4 lg:flex">
      <div className="px-1.5">
        <Link href="/" aria-label="Cadence home">
          <Brand />
        </Link>
      </div>

      <nav className="mt-6 space-y-0.5">
        <Link href="/" className={navItem(pathname === "/")}>
          <CalendarDays className="h-4 w-4" />
          Calendar
        </Link>
        <button type="button" onClick={onOpenAssistant} className={cn(navItem(false), "w-full")}>
          <Sparkles className="h-4 w-4" />
          Assistant
        </button>
        <Link href="/settings" className={navItem(pathname === "/settings")}>
          <Settings2 className="h-4 w-4" />
          Settings
        </Link>
      </nav>

      <div className="mt-6 rounded-xl border border-line bg-white/70 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-[0.18em] text-muted">{periodLabel}</span>
          {mode === "demo" && <Badge variant="warning">demo</Badge>}
        </div>
        <dl className="mt-2.5 space-y-2">
          <div className="flex items-baseline justify-between">
            <dt className="text-[11.5px] text-ink-soft">Meetings</dt>
            <dd className="text-[12px] font-medium tabular">
              {stats.meetingCount}
              <span className="ml-1 text-[10.5px] font-normal text-muted">
                {stats.meetingHours}h
              </span>
            </dd>
          </div>
          <div className="h-px bg-line/80" />
          <div className="flex items-baseline justify-between">
            <dt className="text-[11.5px] text-ink-soft">Focus blocks</dt>
            <dd className="text-[12px] font-medium tabular">{stats.focusHours}h</dd>
          </div>
          <div className="h-px bg-line/80" />
          <div className="flex items-baseline justify-between">
            <dt className="text-[11.5px] text-ink-soft">Conflicts</dt>
            <dd
              className={cn(
                "text-[12px] font-medium tabular",
                stats.conflicts > 0 && "text-clay",
              )}
            >
              {stats.conflicts}
            </dd>
          </div>
        </dl>
        {stats.busiestDay && (
          <p className="mt-2.5 text-[10px] leading-relaxed text-muted">
            Heaviest day: {stats.busiestDay}
          </p>
        )}
      </div>

      {stats.conflicts > 0 && (
        <button
          type="button"
          onClick={onReviewConflicts}
          className="group mt-2 rounded-xl border border-[#EBD9CC] bg-[#FBF0E8] p-3 text-left transition-colors hover:bg-[#F8E9DE]"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">
            <AlertTriangle className="h-3 w-3" />
            Needs a look
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-[#6B4A33]">
            {stats.conflicts} scheduling issue{stats.conflicts === 1 ? "" : "s"} to review this week.
          </p>
          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-clay">
            Review
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </button>
      )}

      <div className="mt-auto space-y-2 pt-4">
        <div className="rounded-xl border border-line bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  mode === "live" ? "bg-[#3E7D63]" : "bg-amber",
                )}
              />
              {mode === "live" ? "Live calendar" : "Demo calendar"}
            </span>
            {viewer.connected && (
              <button
                type="button"
                onClick={onSwitchMode}
                className="text-[10px] text-muted underline underline-offset-2 hover:text-ink"
              >
                switch
              </button>
            )}
          </div>
          <p className="mt-1 truncate text-[10.5px] text-muted">
            {mode === "live"
              ? viewer.googleEmail ?? "Google Calendar"
              : "Sample week for Meridian Labs"}
          </p>
          {!viewer.connected && (
            <a
              href={connectHref}
              className="mt-2 inline-flex text-[10.5px] font-medium text-spruce underline underline-offset-2"
            >
              Connect Google Calendar
            </a>
          )}
        </div>

        {viewer.signedIn ? (
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-xl px-1 py-1.5 transition-colors hover:bg-white/70"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#E5EBE6] text-[10px] font-semibold text-spruce">
              {initials(viewer.name ?? viewer.email ?? "You")}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-medium">
                {viewer.name ?? "Signed in"}
              </span>
              <span className="block truncate text-[10px] text-muted">{viewer.email}</span>
            </span>
          </Link>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2 text-[11px] font-medium text-ink transition-colors hover:border-line-strong"
          >
            Sign in
            <ArrowUpRight className="h-3 w-3 text-muted" />
          </Link>
        )}
      </div>
    </aside>
  );
}
