"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Moon,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    target: "calendar",
    icon: CalendarDays,
    eyebrow: "Step 1 · Calendar",
    title: "Your schedule lives here",
    body: "Switch between Day and Week, move through dates, and scan meetings, focus blocks, conflicts, and open time right in the calendar.",
  },
  {
    target: "assistant-entry",
    icon: Sparkles,
    eyebrow: "Step 2 · Ask Cadence",
    title: "Ask in everyday language",
    body: "Open the Assistant from here. Ask for focus time, a meeting brief, a conflict review, or to schedule a meeting. Cadence uses your calendar and preferences to work out the details.",
  },
  {
    target: "assistant-input",
    icon: Sparkles,
    eyebrow: "Step 3 · Make a request",
    title: "Tell Cadence what you need",
    body: "Try “Schedule a meeting Thursday at 3pm for 44 minutes.” If a detail is missing, Cadence asks a follow-up. For a new event, review the time, duration, agenda, notes, location, and attendees before confirming.",
  },
  {
    target: "theme-toggle",
    icon: Moon,
    eyebrow: "Step 4 · Your theme",
    title: "Switch light and dark mode",
    body: "Use this sun or moon control any time. Your choice is remembered on this device.",
  },
  {
    target: "settings",
    icon: Settings2,
    eyebrow: "Step 5 · Preferences",
    title: "Shape your workday",
    body: "Settings lets you set work hours, lunch, buffers, focus duration, and morning or weekend preferences. Cadence uses them when ranking suggestions.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Point {
  top: number;
  left: number;
}

function findVisibleTarget(name: string) {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  });
}

export function OnboardingTour({
  open,
  onClose,
  onStepChange,
}: {
  open: boolean;
  onClose: () => void;
  onStepChange?: (step: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [popover, setPopover] = useState<Point | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const step = STEPS[index];

  const measure = useCallback(() => {
    const node = findVisibleTarget(step.target);
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    return true;
  }, [step.target]);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    onStepChange?.(index);
    setTargetRect(null);
    let frame = 0;
    let attempts = 0;
    const locate = () => {
      if (measure()) return;
      if (attempts++ < 30) frame = window.requestAnimationFrame(locate);
    };
    frame = window.requestAnimationFrame(locate);
    return () => window.cancelAnimationFrame(frame);
  }, [index, measure, onStepChange, open]);

  useEffect(() => {
    if (!open || !targetRect) return;
    const card = cardRef.current;
    if (!card) return;
    const gap = 14;
    const margin = 16;
    const width = Math.min(card.offsetWidth || 360, window.innerWidth - margin * 2);
    const height = card.offsetHeight || 260;
    const rightSpace = window.innerWidth - targetRect.left - targetRect.width;
    const leftSpace = targetRect.left;
    const bottomSpace = window.innerHeight - targetRect.top - targetRect.height;
    let top: number;
    let left: number;

    if (rightSpace >= width + gap + margin) {
      left = targetRect.left + targetRect.width + gap;
      top = targetRect.top + targetRect.height / 2 - height / 2;
    } else if (leftSpace >= width + gap + margin) {
      left = targetRect.left - width - gap;
      top = targetRect.top + targetRect.height / 2 - height / 2;
    } else if (bottomSpace >= height + gap + margin) {
      left = targetRect.left + targetRect.width / 2 - width / 2;
      top = targetRect.top + targetRect.height + gap;
    } else if (targetRect.top >= height + gap + margin) {
      left = targetRect.left + targetRect.width / 2 - width / 2;
      top = targetRect.top - height - gap;
    } else {
      left = (window.innerWidth - width) / 2;
      top = (window.innerHeight - height) / 2;
    }

    setPopover({
      left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
    });
  }, [open, targetRect]);

  useEffect(() => {
    if (!open || !targetRect) return;
    const update = () => measure();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [measure, open, targetRect]);

  if (!open) return null;

  const Icon = step.icon;
  const last = index === STEPS.length - 1;

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/5" aria-hidden="true" />
      {targetRect && (
        <div
          aria-hidden="true"
          className="pointer-events-auto fixed z-[91] rounded-xl border-2 border-spruce shadow-[0_0_0_9999px_rgba(8,14,11,0.58)] transition-[top,left,width,height] duration-200"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}
      <section
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadence-tour-title"
        aria-describedby="cadence-tour-description"
        className="fixed z-[92] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-line bg-panel p-5 text-ink shadow-panel sm:p-6"
        style={popover ? { top: popover.top, left: popover.left } : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#E9F0EB] text-spruce">
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            {step.eyebrow}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tutorial"
            className="rounded-md px-2 py-1 text-[11px] text-muted hover:bg-paper hover:text-ink"
          >
            Skip
          </button>
        </div>

        <h2 id="cadence-tour-title" className="mt-5 font-serif text-[25px] leading-tight">
          {step.title}
        </h2>
        <p id="cadence-tour-description" className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
          {step.body}
        </p>

        <div className="mt-5 flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((item, stepIndex) => (
            <span
              key={item.eyebrow}
              className={`h-1.5 flex-1 rounded-full ${stepIndex <= index ? "bg-spruce" : "bg-line"}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => (last ? onClose() : setIndex((value) => value + 1))}
          >
            {last ? <><Check className="h-3.5 w-3.5" /> Done</> : <>Next <ChevronRight className="h-3.5 w-3.5" /></>}
          </Button>
        </div>
      </section>
    </>
  );
}
