"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DisconnectButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/calendar/disconnect", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not disconnect the calendar.");
      }
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not disconnect the calendar.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        <Unplug className="h-3.5 w-3.5" />
        Disconnect
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-[#EED9CF] bg-[#FDF4EF] p-3">
      <p className="text-[11.5px] leading-relaxed text-[#6F4230]">
        Disconnect Google Calendar? Cadence deletes the stored credential and
        returns to demo mode. Your Google Calendar itself is untouched.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button variant="danger" size="xs" onClick={disconnect} disabled={busy}>
          {busy ? "Disconnecting…" : "Yes, disconnect"}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-[11px] leading-relaxed text-[#8A3E23]">{error}</p>
      )}
    </div>
  );
}
