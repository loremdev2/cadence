"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from "@/lib/preferences";
import type { SchedulingPreferences } from "@/lib/types";

const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

function clock(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function HourField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (hour: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11.5px] text-ink-soft">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-lg border border-line bg-[#FCFBF8] px-2 py-1 text-[11.5px] tabular outline-none focus:border-spruce/40"
      >
        {HOURS.filter((hour) => hour >= min && hour <= max).map((hour) => (
          <option key={hour} value={hour}>
            {clock(hour)}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  suffix,
  value,
  min,
  max,
  step = 5,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11.5px] text-ink-soft">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-16 rounded-lg border border-line bg-[#FCFBF8] px-2 py-1 text-[11.5px] tabular outline-none focus:border-spruce/40"
        />
        <span className="text-[10.5px] text-muted">{suffix}</span>
      </span>
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-[#FCFBF8] px-2.5 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 accent-[#1F3B32]"
      />
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink">{label}</span>
        <span className="block text-[10.5px] leading-snug text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function PreferencesForm() {
  const [preferences, setPreferences] = useState<SchedulingPreferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  const update = (patch: Partial<SchedulingPreferences>) => {
    setPreferences((current) => normalizePreferences({ ...current, ...patch }));
    setSaved(false);
  };

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        <HourField
          label="Workday starts"
          value={preferences.workdayStart}
          min={0}
          max={12}
          onChange={(hour) => update({ workdayStart: hour })}
        />
        <HourField
          label="Workday ends"
          value={preferences.workdayEnd}
          min={preferences.workdayStart + 2}
          max={24}
          onChange={(hour) => update({ workdayEnd: hour })}
        />
        <HourField
          label="Lunch from"
          value={preferences.lunchStart}
          min={preferences.workdayStart}
          max={preferences.lunchEnd - 1}
          onChange={(hour) => update({ lunchStart: hour })}
        />
        <HourField
          label="Lunch until"
          value={preferences.lunchEnd}
          min={preferences.lunchStart + 1}
          max={preferences.workdayEnd}
          onChange={(hour) => update({ lunchEnd: hour })}
        />
        <NumberField
          label="Buffer between meetings"
          suffix="min"
          value={preferences.bufferMinutes}
          min={0}
          max={60}
          onChange={(value) => update({ bufferMinutes: value })}
        />
        <NumberField
          label="Default focus block"
          suffix="min"
          value={preferences.focusBlockMinutes}
          min={30}
          max={240}
          onChange={(value) => update({ focusBlockMinutes: value })}
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Toggle
          label="Protect lunch"
          hint="No focus block or meeting search lands on your lunch."
          checked={preferences.protectLunch}
          onChange={(checked) => update({ protectLunch: checked })}
        />
        <Toggle
          label="Prefer mornings"
          hint="Morning windows rank above the afternoon."
          checked={preferences.preferMornings}
          onChange={(checked) => update({ preferMornings: checked })}
        />
        <Toggle
          label="Allow weekends"
          hint="Off keeps every suggestion inside the working week."
          checked={preferences.allowWeekends}
          onChange={(checked) => update({ allowWeekends: checked })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] text-muted">
          Stored in this browser and applied to every suggestion.
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => {
              setPreferences(DEFAULT_PREFERENCES);
              savePreferences(DEFAULT_PREFERENCES);
              setSaved(true);
            }}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              savePreferences(preferences);
              setSaved(true);
            }}
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : null}
            {saved ? "Saved" : "Save preferences"}
          </Button>
        </div>
      </div>
    </div>
  );
}
