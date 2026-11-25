"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Info,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AiConflict, AiSlot, AssistantResult, CalEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text?: string;
  result?: AssistantResult;
  error?: boolean;
}

interface AssistantPanelProps {
  messages: ChatMessage[];
  pending: boolean;
  selectedEvent: CalEvent | null;
  mode: "demo" | "live";
  canWrite: boolean;
  onAsk: (prompt: string) => void;
  onJump: (iso: string) => void;
  onBookSlot: (slot: AiSlot, title: string) => Promise<string | null>;
  onGoLive: () => void;
}

interface BookingContext {
  live: boolean;
  canWrite: boolean;
  onBook: (slot: AiSlot, title: string) => Promise<string | null>;
  /** Leaves the demo calendar (or starts sign-in) so a window can be written. */
  onGoLive: () => void;
}

function AnswerText({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) =>
        line.startsWith("- ") || line.startsWith("– ") ? (
          <div key={index} className="flex gap-1.5">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
            <span>{line.replace(/^[-–]\s*/, "")}</span>
          </div>
        ) : (
          <p key={index}>{line}</p>
        ),
      )}
    </div>
  );
}

function SlotCard({
  slot,
  best,
  onJump,
  booking,
}: {
  slot: AiSlot;
  best: boolean;
  onJump: (iso: string) => void;
  booking: BookingContext;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Focus block");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ htmlLink: string | null } | null>(null);

  const submit = async () => {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const htmlLink = await booking.onBook(slot, value);
      setAdded({ htmlLink });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the event.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white p-2.5 transition-all hover:border-spruce/30 hover:shadow-card">
      <button
        type="button"
        onClick={() => onJump(slot.start)}
        className="group w-full text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-muted">
            {slot.dayLabel}
          </span>
          {best ? (
            <Badge variant="spruce">best match</Badge>
          ) : (
            <span className="text-[9.5px] text-muted">{slot.minutes} min</span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-semibold tabular tracking-tight">
            {slot.timeLabel}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted">{slot.reasons[0]}</p>
        <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-[#F1EEE6]">
          <div
            className="h-full rounded-full bg-spruce/60"
            style={{ width: `${slot.score}%` }}
          />
        </div>
      </button>

      {added ? (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#F1F7F2] px-2 py-1.5 text-[10.5px] text-[#2F6449]">
          <Check className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">Added to Google Calendar</span>
          {added.htmlLink && (
            <a
              href={added.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 underline"
            >
              Open
            </a>
          )}
        </div>
      ) : !booking.live ? (
        <div className="mt-2 space-y-1">
          <Button
            size="xs"
            variant="secondary"
            className="w-full gap-1"
            onClick={booking.onGoLive}
          >
            <Plus className="h-3 w-3" />
            Add to Google Calendar
          </Button>
          <p className="text-[10px] leading-snug text-muted">
            The demo calendar is read-only. This opens your live calendar, where you
            can add the window.
          </p>
        </div>
      ) : !booking.canWrite ? (
        <a
          href="/auth/google/start?next=/"
          className="mt-2 flex items-start gap-1 rounded-lg bg-[#FDF4EF] px-2 py-1.5 text-[10.5px] leading-snug text-[#7C452C] underline decoration-[#E9D3C6] underline-offset-2 hover:text-clay"
        >
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          Your calendar connection is read-only. Reconnect to approve adding events.
        </a>
      ) : open ? (
        <div className="mt-2 space-y-1.5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            maxLength={200}
            aria-label="Event title"
            placeholder="Event title"
            className="w-full rounded-lg border border-line bg-[#FCFBF8] px-2 py-1 text-[11.5px] outline-none focus:border-spruce/40"
          />
          <div className="flex gap-1.5">
            <Button
              size="xs"
              className="flex-1"
              onClick={() => void submit()}
              disabled={busy || !title.trim()}
            >
              {busy ? "Adding…" : `Add ${slot.minutes} min`}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
          {error && (
            <p className="text-[10px] leading-snug text-clay">{error}</p>
          )}
        </div>
      ) : (
        <Button
          size="xs"
          variant="ghost"
          className="mt-1.5 w-full gap-1"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3 w-3" />
          Add to Google Calendar
        </Button>
      )}
    </div>
  );
}

const severityDot: Record<AiConflict["severity"], string> = {
  high: "bg-[#B4462A]",
  medium: "bg-amber",
  low: "bg-[#9A9484]",
};

function ConflictCard({ conflict }: { conflict: AiConflict }) {
  return (
    <div className="rounded-xl border border-line bg-white p-2.5">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full",
            severityDot[conflict.severity],
          )}
        />
        <div className="min-w-0">
          <p className="text-[12px] font-medium leading-snug">{conflict.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{conflict.detail}</p>
          <p className="mt-1.5 border-l-2 border-[#E9D3C6] pl-2 text-[11px] leading-relaxed text-[#6B4A33]">
            {conflict.suggestion}
          </p>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  onJump,
  booking,
}: {
  message: ChatMessage;
  onJump: (iso: string) => void;
  booking: BookingContext;
}) {
  if (message.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-[#EED9CF] bg-[#FDF3EE] p-2.5 text-[11.5px] leading-relaxed text-[#7C452C]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{message.text ?? "The assistant could not answer."}</span>
      </div>
    );
  }

  const result = message.result;
  if (!result) {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink-soft">{message.text}</p>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em] text-muted">
        <Sparkles className="h-3 w-3 text-spruce" />
        Cadence
        {!result.usedModel && (
          <span className="ml-auto normal-case tracking-normal text-[9px] text-muted/80">
            heuristic mode
          </span>
        )}
      </div>
      <h3 className="mt-1.5 font-serif text-[17px] leading-snug">{result.headline}</h3>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
        <AnswerText text={result.answer} />
      </div>

      {result.slots.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {result.slots.map((slot, index) => (
            <SlotCard
              key={`${slot.start}-${index}`}
              slot={slot}
              best={index === 0}
              onJump={onJump}
              booking={booking}
            />
          ))}
          <p className="px-0.5 text-[10px] text-muted">
            Click a window to jump to it. Nothing changes until you add one.
          </p>
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {result.conflicts.map((conflict) => (
            <ConflictCard key={conflict.id} conflict={conflict} />
          ))}
        </div>
      )}

      {result.brief && (
        <p className="mt-2 rounded-lg bg-[#F3F5F1] px-2.5 py-2 text-[11px] text-[#3F5A4C]">
          The brief is ready in the Meeting tab.
        </p>
      )}
    </div>
  );
}

export function AssistantPanel({
  messages,
  pending,
  selectedEvent,
  mode,
  canWrite,
  onAsk,
  onJump,
  onBookSlot,
  onGoLive,
}: AssistantPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const booking: BookingContext = {
    live: mode === "live",
    canWrite,
    onBook: onBookSlot,
    onGoLive,
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, pending]);

  const submit = () => {
    const value = input.trim();
    if (!value || pending) return;
    setInput("");
    onAsk(value);
  };

  const actions = [
    {
      icon: Clock,
      label: "Find a 45-minute focus block",
      prompt: "Find me a 45-minute focus block this week",
    },
    {
      icon: FileText,
      label: selectedEvent
        ? `Prep me for “${selectedEvent.title}”`
        : "Prep me for my next meeting",
      prompt: selectedEvent
        ? `Prep me for ${selectedEvent.title}`
        : "Prep me for my next meeting",
    },
    {
      icon: AlertTriangle,
      label: "Review this week for conflicts",
      prompt: "Review this week for conflicts",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="cadence-scroll min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="px-4 pb-5 pt-4">
            <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.18em] text-muted">
              <Sparkles className="h-3 w-3 text-spruce" />
              Cadence
            </div>
            <h2 className="mt-2 font-serif text-[23px] leading-tight">
              What should we look at?
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              I read the range you are viewing and suggest changes you can review.
              Nothing changes until you add a window yourself.
            </p>

            <div className="mt-4 space-y-1.5">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => onAsk(action.prompt)}
                  className="group flex w-full items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2.5 text-left transition-all hover:border-line-strong hover:shadow-sm"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#F1EFE7] text-spruce">
                    <action.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate text-[12px] font-medium">{action.label}</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-line p-3 text-[11px] leading-relaxed text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Try “Find 30 minutes on Thursday afternoon”, or select a meeting first and
              ask for a brief.
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[#EBF0EC] px-3 py-2 text-[12.5px] leading-relaxed text-[#22332C]">
                    {message.text}
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  onJump={onJump}
                  booking={booking}
                />
              ),
            )}

            {pending && (
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="flex gap-1">
                  <span className="typing-dot h-1 w-1 rounded-full bg-spruce" />
                  <span className="typing-dot h-1 w-1 rounded-full bg-spruce" />
                  <span className="typing-dot h-1 w-1 rounded-full bg-spruce" />
                </span>
                Reading your calendar…
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="border-t border-line bg-[#FCFBF8] p-3"
      >
        <div className="rounded-xl border border-line bg-white p-1.5 shadow-sm transition-colors focus-within:border-spruce/40 focus-within:ring-2 focus-within:ring-spruce/10">
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about your week…"
            aria-label="Ask Cadence about your calendar"
            className="w-full resize-none bg-transparent px-1.5 py-1 text-[12.5px] leading-relaxed outline-none placeholder:text-muted/80"
          />
          <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5">
            <span className="text-[9.5px] text-muted">
              {pending ? "Reading your calendar…" : "Enter to send"}
            </span>
            <button
              type="submit"
              disabled={!input.trim() || pending}
              aria-label="Send message"
              className="grid h-7 w-7 place-items-center rounded-lg bg-spruce text-[#F7F5EF] transition-opacity hover:bg-[#162e27] disabled:opacity-35"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1 px-1 text-[9.5px] text-muted">
          <ShieldCheck className="h-3 w-3" />
          Cadence writes only the window you add
        </p>
      </form>
    </div>
  );
}
