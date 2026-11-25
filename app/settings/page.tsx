import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Check,
  CircleAlert,
  Database,
  FlaskConical,
  KeyRound,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DisconnectButton } from "@/components/disconnect-button";
import { getViewer } from "@/lib/viewer";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  storage_not_configured:
    "Sign-in worked, but calendar storage is not configured (SUPABASE_SERVICE_ROLE_KEY is missing).",
  encryption_not_configured:
    "Sign-in worked, but TOKEN_ENCRYPTION_KEY is missing or invalid, so the credential could not be stored.",
  storage_failed:
    "Sign-in worked, but the calendar connection could not be saved. Check the migration and the service-role key.",
  consent_denied:
    "Google Calendar access was declined. Cadence needs calendar access to show your real week.",
  encryption_failed:
    "The Google credential could not be encrypted. Check TOKEN_ENCRYPTION_KEY and try again.",
  oauth_state:
    "The Google sign-in response could not be verified. Start again from this page.",
  exchange_failed:
    "Google sign-in did not complete. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and that the redirect URI matches NEXT_PUBLIC_APP_URL/auth/callback.",
  identity_unverified:
    "Google's identity response could not be verified. Please try again.",
  user_store_failed:
    "Sign-in worked, but the account could not be saved. Check SUPABASE_URL, the service-role key and the migration.",
};

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#F2F0E8] text-spruce">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 py-2 text-[11.5px] last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 text-right text-ink-soft">{children}</span>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    error?: string;
  }>;
}) {
  const viewer = await getViewer();
  const params = await searchParams;

  const errorMessage = params.error ? ERRORS[params.error] ?? "Something went wrong." : null;
  const justConnected = params.connected === "1";
  const scopeMissing = params.connected === "0";
  const calendarPermission = viewer.scopes.some((scope) =>
    [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar",
    ].includes(scope),
  );

  const status = !viewer.signedIn
    ? { label: "Not connected", variant: "neutral" as const }
    : viewer.connected
      ? { label: "Connected", variant: "success" as const }
      : viewer.connectionStatus === "missing_scope"
        ? { label: "Permission missing", variant: "danger" as const }
        : viewer.connectionStatus === "revoked"
          ? { label: "Reconnect needed", variant: "danger" as const }
          : viewer.connectionStatus === "error"
            ? { label: "Needs attention", variant: "warning" as const }
            : { label: "Not connected", variant: "neutral" as const };

  return (
    <main className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" aria-label="Cadence home">
            <Brand />
          </Link>
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to calendar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-7 lg:px-8">
        <h1 className="font-serif text-[30px] leading-tight tracking-[-0.01em]">
          Settings
        </h1>
        <p className="mt-1.5 text-[12.5px] text-muted">
          Account, calendar connection, and what Cadence is allowed to do.
        </p>

        {justConnected && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#CFE3D6] bg-[#F1F7F2] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#2F6449]">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Calendar connected. Your real week is now available from the calendar
            screen.
          </div>
        )}
        {scopeMissing && !errorMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#EED9CF] bg-[#FDF4EF] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#7C452C]">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Signed in, but calendar permission was not granted. Reconnect and
            approve the calendar checkbox to see your events.
          </div>
        )}
        {errorMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#EED9CF] bg-[#FDF4EF] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#7C452C]">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {errorMessage}
          </div>
        )}

        <div className="mt-5 space-y-3">
          <Section
            icon={KeyRound}
            title="Account"
            description="Sign-in talks to Google directly; Cadence keeps its own signed, HttpOnly session cookie."
          >
            {viewer.signedIn ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#E6ECE7] text-[12px] font-semibold text-spruce">
                    {initials(viewer.name ?? viewer.email ?? "You")}
                  </span>
                  <div>
                    <div className="text-[12.5px] font-medium">
                      {viewer.name ?? "Signed in"}
                    </div>
                    <div className="text-[11px] text-muted">{viewer.email}</div>
                  </div>
                </div>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "secondary", size: "sm", className: "gap-1.5" })}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium">You are browsing as a guest</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Demo data only. Sign in to connect a real calendar.
                  </p>
                </div>
                <Link
                  href="/login"
                  className={buttonVariants({ size: "sm", className: "gap-1.5" })}
                >
                  Sign in
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </Section>

          <Section
            icon={CalendarCheck2}
            title="Google Calendar"
            description="Calendar event access granted by Google with offline access, so the server can refresh the token without you. Adding a window writes exactly that one event."
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <Badge variant={status.variant}>{status.label}</Badge>
              {viewer.signedIn && (
                <a
                  href="/auth/google/start?next=/settings"
                  className={buttonVariants({
                    variant: viewer.connected ? "secondary" : "default",
                    size: "sm",
                  })}
                >
                  {viewer.connected || viewer.connectionStatus
                    ? "Reconnect"
                    : "Connect Google Calendar"}
                </a>
              )}
            </div>

            <div>
              <Row label="Google account">
                {viewer.googleEmail ?? <span className="text-muted">—</span>}
              </Row>
              <Row label="Access">
                {!calendarPermission
                  ? "Not granted"
                  : viewer.canWrite
                    ? "Read and write events"
                    : "Read-only events"}
              </Row>
              <Row label="Connected">
                {viewer.connectedAt
                  ? format(new Date(viewer.connectedAt), "d MMM yyyy, HH:mm")
                  : "—"}
              </Row>
              <Row label="Scopes">
                <span className="break-all font-mono text-[10px] text-muted">
                  {viewer.scopes.length > 0
                    ? viewer.scopes
                        .map((scope) => scope.split("/auth/").pop())
                        .join(", ")
                    : "none"}
                </span>
              </Row>
            </div>

            {viewer.connected && !viewer.canWrite && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#EED9CF] bg-[#FDF4EF] px-3 py-2 text-[11px] leading-relaxed text-[#7C452C]">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This connection is read-only, so suggested windows cannot be added.
                Reconnect to grant write access to events.
              </p>
            )}

            {viewer.signedIn && viewer.connectionStatus && (
              <div className="mt-3">
                <DisconnectButton />
              </div>
            )}

            {!viewer.authConfigured && (
              <div className="mt-3 rounded-lg border border-[#EFE2C6] bg-[#FBF3E1] p-3 text-[11px] leading-relaxed text-[#7A5A1E]">
                Google OAuth is not configured in this deployment, so connecting
                a calendar is unavailable. Demo mode is fully usable.
              </div>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
              Cadence adds only a window you approve. It never edits, moves or
              deletes an event, and it never invites anyone.
            </p>
          </Section>

          <Section
            icon={FlaskConical}
            title="Demo mode"
            description="A seeded week for a fictional operations lead, useful for reviewing the product without any Google setup."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[340px] text-[11.5px] leading-relaxed text-muted">
                The demo uses the same scheduling engine and assistant as a real
                calendar. Every number is computed from the sample events.
              </p>
              <Link
                href="/"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open demo calendar
              </Link>
            </div>
          </Section>

          <Section
            icon={Sparkles}
            title="Assistant"
            description="Intent parsing and explanations run through OpenRouter. Availability and conflicts are always computed in code."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={viewer.aiConfigured ? "spruce" : "neutral"}>
                {viewer.aiConfigured ? "OpenRouter" : "Heuristic mode"}
              </Badge>
              <span className="text-[11.5px] text-muted">
                {viewer.aiConfigured
                  ? viewer.aiModel
                  : "No API key set — explanations use deterministic copy, numbers are identical."}
              </span>
            </div>
          </Section>

          <Section
            icon={Database}
            title="Data and privacy"
            description="What is stored, where, and for how long."
          >
            <ul className="space-y-2 text-[11.5px] leading-relaxed text-ink-soft">
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C9C1B2]" />
                Google refresh and access tokens are encrypted with AES-256-GCM and
                stored in a Postgres table that browser clients have no key for.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C9C1B2]" />
                Events are fetched per visible range and are never persisted to the
                database.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C9C1B2]" />
                Only the details needed for your request are sent to the model.
                Attendee email addresses are never included.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C9C1B2]" />
                Disconnecting deletes the stored credential immediately. Google
                Calendar itself is untouched.
              </li>
            </ul>
          </Section>
        </div>

        <p className="mt-6 text-[10.5px] leading-relaxed text-muted">
          The app writes to Google only when you add a suggested window. Editing
          existing events and coworker availability are planned next steps.
        </p>
      </div>
    </main>
  );
}
