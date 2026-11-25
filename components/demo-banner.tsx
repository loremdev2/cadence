"use client";

import { FlaskConical, X } from "lucide-react";

export function DemoBanner({
  authConfigured,
  onDismiss,
}: {
  authConfigured: boolean;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[#EFE2C6] bg-[#FBF3E1] px-4 py-2 text-[11.5px] text-[#7A5A1E] lg:px-6">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        Demo calendar — a sample week for Maya Chen at Meridian Labs.
      </span>
      <a
        href={authConfigured ? "/auth/google/start?next=/" : "/login"}
        className="ml-auto hidden shrink-0 font-medium underline underline-offset-2 hover:text-[#5F4614] sm:inline"
      >
        Connect Google Calendar
      </a>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss demo banner"
        className="ml-1 grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-[#F3E5C9]"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
