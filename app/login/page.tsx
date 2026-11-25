import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarOff, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "@/components/sidebar";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  not_configured:
    "Sign-in is not configured in this environment. Demo mode is fully available.",
  oauth_state:
    "The Google sign-in response could not be verified. Start again from this page.",
  exchange_failed:
    "Google sign-in did not complete. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and the redirect URI.",
  identity_unverified:
    "Google's identity response could not be verified. Please try again.",
  user_store_failed:
    "Sign-in worked, but the account could not be saved. Check SUPABASE_URL and the service-role key.",
  session_secret_missing:
    "SESSION_SECRET is missing or shorter than 32 bytes, so sign-in is unavailable.",
  auth_failed: "Sign-in did not complete. Please try again.",
  consent_denied:
    "Calendar access was declined. You can still explore the full demo.",
  missing_code: "The sign-in response was incomplete. Please try again.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
      />
      <path
        fill="currentColor"
        opacity="0.72"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        opacity="0.5"
        d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.35-2.59Z"
      />
      <path
        fill="currentColor"
        opacity="0.85"
        d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.86-2.86C16.96 2.99 14.7 2 12 2A10 10 0 0 0 3.06 7.49l3.35 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (viewer.signedIn) redirect("/calendar");

  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const message = errorKey
    ? ERRORS[errorKey] ?? "Something went wrong during sign-in."
    : null;

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[1.02fr_1fr]">
      <section
        className="relative hidden flex-col justify-between overflow-hidden px-12 py-11 text-[#F3F0E7] lg:flex"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 8% 0%, #2E5648 0%, #1E3D33 52%, #142A24 100%)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#F3F0E7]/12 ring-1 ring-white/15">
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
          <div className="leading-none">
            <div className="font-serif text-[19px]">Cadence</div>
            <div className="mt-1 text-[8.5px] uppercase tracking-[0.2em] text-[#C8D3CB]">
              calendar intelligence
            </div>
          </div>
        </div>

        <div className="max-w-[440px]">
          <h1 className="font-serif text-[52px] leading-[1.02] tracking-[-0.015em]">
            Your week,
            <br />
            with the noise
            <br />
            removed.
          </h1>
          <p className="mt-5 max-w-[380px] text-[13px] leading-relaxed text-[#CBD6CF]">
            Cadence reads your calendar, finds the gaps that actually exist, and
            tells you what to do differently — changing nothing unless you add it.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              {
                icon: ShieldCheck,
                title: "Writes only when you ask",
                body: "It can add a window you approve, and nothing else. No edits, no deletes, no invitations.",
              },
              {
                icon: Sparkles,
                title: "Suggestions, not changes",
                body: "Open slots and conflicts are computed in code from your real events, then explained.",
              },
              {
                icon: CalendarOff,
                title: "Works before you connect",
                body: "A seeded demo week makes the whole product usable with no Google setup at all.",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/8 ring-1 ring-white/12">
                  <item.icon className="h-3.5 w-3.5 text-[#DCE5DE]" />
                </span>
                <div>
                  <div className="text-[12px] font-medium text-[#F3F0E7]">{item.title}</div>
                  <p className="mt-0.5 max-w-[330px] text-[11.5px] leading-relaxed text-[#B9C7BE]">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[10.5px] uppercase tracking-[0.16em] text-[#8FA398]">
          Meridian Labs · sample workspace
        </p>
      </section>

      <section className="flex min-h-dvh flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[368px]">
          <div className="lg:hidden">
            <Link href="/" aria-label="Cadence home">
              <Brand />
            </Link>
          </div>

          <div className="mt-8 lg:mt-0">
            <h2 className="font-serif text-[31px] leading-tight tracking-[-0.01em]">
              Sign in to Cadence
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Connect your Google Calendar, or look around the demo week first.
              Nothing changes until you add a suggested window.
            </p>
          </div>

          {message && (
            <div className="mt-4 rounded-xl border border-[#EED9CF] bg-[#FDF4EF] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#7C452C]">
              {message}
            </div>
          )}

          <div className="mt-6 space-y-2">
            {viewer.authConfigured ? (
              <a
                href="/auth/google/start?next=/calendar"
                className={buttonVariants({ size: "lg", className: "w-full gap-2" })}
              >
                <GoogleMark />
                Continue with Google
              </a>
            ) : (
              <div className="rounded-xl border border-line bg-white p-3.5">
                <p className="text-[11.5px] font-medium text-ink">
                  Google sign-in is not configured
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  This deployment has no Google OAuth credentials, so sign-in
                  is unavailable. Demo mode is complete and needs nothing.
                </p>
              </div>
            )}

            <Link
              href="/calendar"
              className={buttonVariants({
                variant: "secondary",
                size: "lg",
                className: "w-full gap-2",
              })}
            >
              Explore the demo
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-6 space-y-2.5 border-t border-line pt-5">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spruce" />
              Requests calendar event access only. Tokens stay on the server,
              encrypted, and never reach the browser.
            </p>
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
              <CalendarOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spruce" />
              Find-a-time means a gap in <em className="px-0.5">your</em> calendar.
              Coworker availability is not available in this version.
            </p>
          </div>

          <p className="mt-8 text-[10px] text-muted/80">
            Demo events are sample data for a fictional company. Real calendar data
            is only read after you approve access.
          </p>
        </div>
      </section>
    </main>
  );
}
