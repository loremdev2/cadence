"use client";

import type { ReactNode } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PanelTab = "assistant" | "meeting";

export function RightPanel({
  tab,
  onTabChange,
  onClose,
  assistant,
  meeting,
  hasEvent,
  className,
}: {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose?: () => void;
  assistant: ReactNode;
  meeting: ReactNode;
  hasEvent: boolean;
  className?: string;
}) {
  const tabClass = (active: boolean) =>
    cn(
      "rounded-[6px] px-2.5 py-1 text-[10.5px] font-medium transition-colors",
      active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
    );

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col border-l border-line bg-panel",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="inline-flex rounded-lg bg-[#F4F1E8] p-0.5">
          <button
            type="button"
            onClick={() => onTabChange("assistant")}
            aria-pressed={tab === "assistant"}
            className={cn(tabClass(tab === "assistant"), "flex items-center gap-1")}
          >
            <Sparkles className="h-3 w-3" />
            Assistant
          </button>
          <button
            type="button"
            onClick={() => onTabChange("meeting")}
            aria-pressed={tab === "meeting"}
            className={tabClass(tab === "meeting")}
          >
            Meeting
            {hasEvent && (
              <span className="ml-1 inline-block h-1 w-1 rounded-full bg-clay align-middle" />
            )}
          </button>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-[#F4F1E8] hover:text-ink xl:hidden"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 flex-col",
          tab === "assistant" ? "flex" : "hidden",
        )}
      >
        {assistant}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 flex-col",
          tab === "meeting" ? "flex" : "hidden",
        )}
      >
        {meeting}
      </div>
    </aside>
  );
}
