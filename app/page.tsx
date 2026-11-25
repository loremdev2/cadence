import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  Clock3,
  Compass,
  MoveRight,
  ShieldCheck,
  Sparkles,
  SunMedium,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Brand } from "@/components/sidebar";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-paper text-ink">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" aria-label="Cadence home"><Brand hideWordmarkOnMobile /></Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link href="#how-it-works" className="hidden px-3 py-2 text-[12px] text-ink-soft transition-colors hover:text-ink sm:inline-flex">
            How it works
          </Link>
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm", className: "hidden sm:inline-flex" })}>
            Sign in
          </Link>
          <Link href="/calendar" className={buttonVariants({ size: "sm", className: "gap-1.5" })}>
            Open Cadence <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-14 lg:grid-cols-[0.93fr_1.07fr] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-16">
        <div className="absolute -left-32 top-16 h-80 w-80 rounded-full bg-[#D9E5DC]/50 blur-3xl" />
        <div className="relative z-[1] max-w-[570px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-spruce">
            <Sparkles className="h-3 w-3" /> A clearer way to plan your week
          </div>
          <h1 className="mt-6 max-w-[560px] font-serif text-[48px] leading-[0.99] tracking-[-0.035em] sm:text-[62px] lg:text-[72px]">
            Your calendar is full. <span className="text-spruce">Your week still has options.</span>
          </h1>
          <p className="mt-6 max-w-[480px] text-[15px] leading-[1.8] text-ink-soft sm:text-[16px]">
            Cadence reads the shape of your week, finds room for focused work, and helps you prepare or schedule meetings—with every change yours to review first.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/calendar" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              Explore the demo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="#how-it-works" className={buttonVariants({ variant: "secondary", size: "lg", className: "gap-2" })}>
              See how it works <ArrowDownRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 flex items-center gap-2 text-[11px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-spruce" />
            Start with sample data. Connect Google Calendar when you’re ready.
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[660px] lg:ml-auto">
          <div className="absolute -right-10 -top-8 h-48 w-48 rounded-full bg-[#F0E5CC]/60 blur-3xl" />
          <div className="relative rotate-[1deg] rounded-[24px] border border-line bg-panel p-2.5 shadow-[0_30px_100px_-45px_rgba(21,44,35,0.38)] sm:p-3">
            <div className="overflow-hidden rounded-[17px] border border-line bg-paper">
              <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-spruce text-white"><CalendarDays className="h-3.5 w-3.5" /></span>
                  <div>
                    <p className="text-[11px] font-semibold">Your week</p>
                    <p className="mt-0.5 text-[9px] text-muted">A sample calendar</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-line bg-paper p-0.5 text-[9px]">
                  <span className="rounded-md bg-panel px-2 py-1 text-ink-soft">Day</span>
                  <span className="rounded-md bg-spruce px-2 py-1 text-white">Week</span>
                </div>
              </div>

              <div className="grid grid-cols-[38px_repeat(3,minmax(0,1fr))] border-b border-line bg-panel px-3 py-2.5 text-center sm:grid-cols-[52px_repeat(5,minmax(0,1fr))] sm:px-4">
                <span />
                {["MON", "TUE", "WED", "THU", "FRI"].map((day, index) => (
                  <div key={day} className={`text-[8px] tracking-[0.12em] text-muted ${index < 2 ? "hidden sm:block" : ""}`}>
                    {day}<span className={`mt-1 block text-[12px] font-medium tracking-normal ${index === 2 ? "text-spruce" : "text-ink"}`}>{[16, 17, 18, 19, 20][index]}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[38px_repeat(3,minmax(0,1fr))] bg-panel px-3 py-3 sm:grid-cols-[52px_repeat(5,minmax(0,1fr))] sm:px-4">
                <div className="flex flex-col justify-between pb-1 pr-2 text-[8px] text-muted">
                  <span>9 AM</span><span>11 AM</span><span>1 PM</span><span>3 PM</span><span>5 PM</span>
                </div>
                {[0, 1, 2, 3, 4].map((day) => (
                  <div key={day} className={`relative h-[180px] border-l border-dashed border-line px-1.5 sm:h-[208px] sm:px-2 ${day < 2 ? "hidden sm:block" : ""}`}>
                    <span className="absolute inset-x-0 top-[25%] border-t border-line/60" />
                    <span className="absolute inset-x-0 top-[50%] border-t border-line/60" />
                    <span className="absolute inset-x-0 top-[75%] border-t border-line/60" />
                    {day === 0 && <div className="absolute inset-x-1 top-[7%] rounded-md border-l-2 border-[#82998A] bg-[#E9F0EB] px-1.5 py-1 text-[8px] leading-tight text-ink sm:text-[9px]">Product<br className="sm:hidden" /> review</div>}
                    {day === 1 && <div className="absolute inset-x-1 top-[39%] rounded-md border-l-2 border-[#64816F] bg-[#E0EAE3] px-1.5 py-1 text-[8px] leading-tight text-ink sm:text-[9px]">Focus block</div>}
                    {day === 2 && <>
                      <div className="absolute inset-x-1 top-[10%] rounded-md border-l-2 border-[#A89771] bg-[#F3EBD8] px-1.5 py-1 text-[8px] leading-tight text-ink sm:text-[9px]">Team sync</div>
                      <div className="absolute inset-x-1 top-[64%] rounded-md border border-dashed border-spruce/40 bg-spruce/[0.04] px-1.5 py-1 text-[8px] leading-tight text-spruce sm:text-[9px]">Open time</div>
                    </>}
                    {day === 3 && <div className="absolute inset-x-1 top-[22%] rounded-md border-l-2 border-[#82998A] bg-[#E9F0EB] px-1.5 py-1 text-[8px] leading-tight text-ink sm:text-[9px]">Planning</div>}
                    {day === 4 && <div className="absolute inset-x-1 top-[50%] rounded-md border-l-2 border-[#64816F] bg-[#E0EAE3] px-1.5 py-1 text-[8px] leading-tight text-ink sm:text-[9px]">Focus time</div>}
                  </div>
                ))}
              </div>

              <div className="border-t border-line bg-panel px-3 pb-3 sm:px-4">
                <div className="ml-auto max-w-[330px] rounded-xl border border-line bg-white p-3 shadow-card dark:bg-panel">
                  <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.12em] text-spruce"><Sparkles className="h-3 w-3" /> Cadence suggestion</div>
                  <p className="mt-1.5 text-[11px] font-semibold text-ink">Protect a 90-minute focus block</p>
                  <p className="mt-1 text-[9.5px] leading-relaxed text-muted">Thursday, 1:30–3:00 PM · fits your workday and keeps lunch clear.</p>
                  <div className="mt-2.5 flex items-center justify-between rounded-lg bg-[#F1F5F2] px-2.5 py-2 text-[9px] text-spruce dark:bg-[#202a25]">
                    <span className="flex items-center gap-1.5"><Check className="h-3 w-3" /> Review the option</span><MoveRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-3 flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 shadow-card sm:-left-7">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#F5F2EA] text-spruce dark:bg-[#202a25]"><SunMedium className="h-4 w-4" /></span>
            <span><span className="block text-[10px] font-semibold">Focus, protected</span><span className="mt-0.5 block text-[9px] text-muted">Your week, with room to think</span></span>
          </div>
        </div>
      </section>

      <section aria-labelledby="product-video-title" className="border-y border-line bg-panel/60 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-spruce">A 20-second product tour</p>
            <h2 id="product-video-title" className="mt-3 font-serif text-[36px] leading-tight tracking-[-0.025em] sm:text-[48px]">
              See Cadence make room in your week.
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft sm:text-[15px]">
              Ask for a meeting, review the suggested time and details, then confirm when it looks right.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-[#161914] shadow-[0_28px_80px_-40px_rgba(21,44,35,0.42)] sm:rounded-[24px]">
            <video
              aria-label="Cadence product tour: natural language scheduling, editable meeting details, and user confirmation"
              className="aspect-video w-full"
              controls
              playsInline
              preload="metadata"
              poster="/cadence-demo-poster.jpg"
            >
              <source src="/cadence-demo.mp4" type="video/mp4" />
              Your browser does not support embedded video.
            </video>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-panel/60">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-6 sm:grid-cols-3 sm:px-8 lg:px-12">
          {[
            [Compass, "See the shape of your week", "Meetings, focus time, open space, and conflicts in one view."],
            [Clock3, "Find time that fits", "Suggestions consider your work hours, lunch, and buffers."],
            [CalendarCheck2, "Stay in control", "Review the details before anything is added to your calendar."],
          ].map(([Icon, title, body]) => {
            const FeatureIcon = Icon as typeof Compass;
            return <div key={title as string} className="flex gap-3 rounded-xl px-2 py-2 sm:px-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#E9F0EB] text-spruce"><FeatureIcon className="h-4 w-4" /></span>
              <span><span className="block text-[12px] font-semibold">{title as string}</span><span className="mt-1 block max-w-[280px] text-[10.5px] leading-relaxed text-muted">{body as string}</span></span>
            </div>;
          })}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
        <div className="max-w-[600px]">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-spruce">A little more breathing room</p>
          <h2 className="mt-3 font-serif text-[37px] leading-[1.04] tracking-[-0.025em] sm:text-[48px]">From “when can we meet?” to a plan you can review.</h2>
          <p className="mt-4 text-[13px] leading-[1.8] text-ink-soft">Describe the outcome you want. Cadence checks the calendar, asks about missing details, and shows the tradeoffs before you choose.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { n: "01", title: "Ask for what you need", body: "“Find 90 minutes for focus before Thursday, avoiding mornings.” Or describe a meeting in one sentence.", icon: Sparkles },
            { n: "02", title: "See why it fits", body: "Review open times against your existing meetings and the workday preferences you set.", icon: Compass },
            { n: "03", title: "Confirm the details", body: "Edit the duration, agenda, notes, location, and attendees. Nothing is created until you confirm.", icon: ShieldCheck },
          ].map(({ n, title, body, icon: Icon }) => <article key={n} className="rounded-2xl border border-line bg-panel p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between"><span className="font-serif text-[22px] text-spruce/60">{n}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F1EFE7] text-spruce dark:bg-[#202a25]"><Icon className="h-4 w-4" /></span></div>
            <h3 className="mt-7 text-[14px] font-semibold">{title}</h3>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{body}</p>
          </article>)}
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-24 lg:px-12">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[28px] bg-spruce px-6 py-10 text-[#F7F5EF] sm:px-10 sm:py-14 lg:px-14">
          <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-2 -top-12 h-64 w-64 rounded-full border border-white/10" />
          <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
            <div className="max-w-[580px]">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#BBCBBF]">Start with a sample week</p>
              <h2 className="mt-3 font-serif text-[38px] leading-[1.02] tracking-[-0.02em] sm:text-[52px]">Make space for the work you came to do.</h2>
              <p className="mt-4 max-w-[480px] text-[12px] leading-relaxed text-[#D6DED8]">Explore Cadence with demo data, then connect Google Calendar when you’re ready to work with your schedule.</p>
            </div>
            <Link href="/calendar" className={buttonVariants({ variant: "secondary", size: "lg", className: "shrink-0 gap-2 border-white/20 bg-white text-spruce hover:bg-[#F3F1EA]" })}>
              Open the demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-[10px] text-muted">
          <Link href="/" aria-label="Cadence home"><Brand compact /></Link>
          <span>Thoughtful planning for people with full calendars.</span>
          <Link href="/login" className="transition-colors hover:text-ink">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
