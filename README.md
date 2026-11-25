# Cadence — calendar intelligence

A Next.js app that reads a Google Calendar and suggests how to improve the week: open focus time, meeting briefs, conflict fixes, and alternative times for an existing meeting. Calendar changes happen only after you explicitly choose an action.

**Demo mode works with no credentials at all.** The calendar, slot finder, conflict detector and assistant all run against a seeded business week until you connect a real calendar.

## Stack

- Next.js 15 App Router + TypeScript
- Tailwind CSS + local shadcn-style components + Lucide
- FullCalendar 6 for the day/week grid
- **Google OAuth directly** (authorization code + PKCE), with the app's own HMAC-signed session cookie
- Postgres on Supabase, used as a database only: no Supabase Auth, no Supabase key in the browser
- Google Calendar API v3, `events.list` + `events.insert` with `calendar.events`
- Vercel AI SDK 5 + `@openrouter/ai-sdk-provider`

## Run locally

```bash
bun install          # or npm install
bun run dev          # http://localhost:3000
bun run typecheck
bun run build
```

No environment variables are required to see the product. The app opens in demo mode.

## Environment

Copy `.env.example` to `.env.local` and fill only what you have. Each block unlocks one capability.

| Variable | Where it comes from | Unlocks |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API (**server only**) | user + token storage |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (**server only**) | user + token storage |
| `GOOGLE_CLIENT_ID` | Google Cloud → Credentials | Google sign-in |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → Credentials (**server only**) | sign-in and token refresh |
| `SESSION_SECRET` | `openssl rand -base64 32` | signed session cookie, OAuth state |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` | encryption of stored tokens |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys (**server only**) | LLM explanations and briefs |
| `OPENROUTER_MODEL` | any model id from openrouter.ai/models | pins the model |
| `AI_RATE_LIMIT_PER_MINUTE` | optional server setting | per-user/demo-IP AI request cap (default 10) |
| `AI_RATE_LIMIT_PER_DAY` | optional server setting | per-user/demo-IP daily cap (default 50) |
| `AI_RATE_LIMIT_GLOBAL_PER_DAY` | optional server setting | shared daily AI-key cap (default 500) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` / your Vercel URL | OAuth redirect URI |

Never prefix a secret with `NEXT_PUBLIC_`. Never commit `.env.local`.

## How sign-in works

1. `/auth/google/start` generates a random `state` and a PKCE verifier, stores both in a signed, HttpOnly cookie that expires in ten minutes, and redirects to Google with the calendar event scope.
2. Google returns to `/auth/callback`. The route verifies the state against that cookie, exchanges the code using the PKCE verifier, and verifies the returned ID token (audience, issuer, expiry, verified email).
3. The user row is upserted by Google `sub`, the refresh and access tokens are encrypted with AES-256-GCM, and a signed session cookie (`cadence_session`, HttpOnly, SameSite=Lax, `Secure` in production, 30 days) is issued.
4. Every later request reads that cookie. There is no session lookup in a third-party auth service, and no browser-side auth SDK.

Signing out clears the cookie. Changing `SESSION_SECRET` invalidates every session; changing `TOKEN_ENCRYPTION_KEY` invalidates stored tokens and forces a reconnect.

## Supabase setup

Supabase is only the database here.

1. Create a project at supabase.com.
2. **SQL Editor**: run `supabase/migrations/0001_calendar_connections.sql` and `supabase/migrations/0002_ai_rate_limits.sql`.
3. Copy the **project URL** and **service-role key** into `.env.local` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Do **not** enable Supabase Auth, and do not add redirect URLs there — Google returns to this app directly. The migration creates `app_users` and `calendar_connections`, enables RLS on both with zero policies, and revokes all access from `anon` and `authenticated`, so only the service role (server code) can read them.

If you previously ran the Supabase-Auth version of the migration, drop `public.calendar_connections` and `public.profiles` before running it again.

## Google setup

1. Create/select a Google Cloud project and enable the **Google Calendar API**.
2. Configure the **OAuth consent screen** and add the scopes
   `https://www.googleapis.com/auth/calendar.events` (read and write events),
   `openid`, `email`, `profile`.
3. Add test users while the app is in Testing.
4. Create an **OAuth client ID → Web application**:
   - Authorized redirect URI: `http://localhost:3000/auth/callback`
     (exactly `<NEXT_PUBLIC_APP_URL>/auth/callback`; add the Vercel one too)
   - Authorized JavaScript origin: `http://localhost:3000`
5. Put the client ID and secret in `.env.local`.

The app requests `access_type=offline` and `prompt=consent`, then stores the refresh token encrypted so it can refresh access without the browser.

## OpenRouter

Create a key with a spend limit and pin a model:

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=particle-ai/particle-1:free
```

The default is a free model, so no credits are needed. Free ids end in `:free`; the app switches reasoning off for them (free endpoints are mostly reasoning models that would otherwise spend the whole token budget on hidden reasoning) and lets OpenRouter fail over to `nvidia/nemotron-3.5-super-vl:free` and `nvidia/nemotron-3.5-lightning:free` when one is rate-limited.

Without a key the app still works: slots and conflicts are computed in code and the copy falls back to deterministic text. The UI shows “heuristic mode” rather than pretending a model answered.

The AI endpoint is rate-limited to 10 requests per minute and 50 per day per signed-in user (or demo visitor IP), with a shared cap of 500 requests per day. The Supabase migration stores atomic counters across server instances. If Supabase is not configured, the limiter falls back to process-local counters; set the three `AI_RATE_LIMIT_*` variables to change the limits.

Free models are rate-limited per account: 20 requests a minute and 50 a day until the account has bought $10 of credits lifetime, then 1000 a day. Each answer costs two requests (interpretation plus narration), so a token-free account gets roughly 25 answers a day. Hitting the cap is not an error — the answer falls back to the deterministic copy and the server logs `assistant narration fell back to template`.

## Deploy

1. Import the repo into Vercel; framework preset Next.js.
2. Add all env vars to Production and Preview. `NEXT_PUBLIC_APP_URL` must match each environment's public origin exactly, with no trailing slash.
3. Add `https://<app>.vercel.app/auth/callback` to the Google OAuth client's authorized redirect URIs and `https://<app>.vercel.app` to its JavaScript origins.
4. Redeploy after env changes.
5. Verify in a private window: demo week, sign-in, consent, real events, assistant, disconnect.

## How suggestions are generated

1. **Interpret the request** — OpenRouter returns intent, duration and date bounds; a regex parser takes over when the key is absent or the call fails. Event requests use a guided parser so missing duration or time becomes a short follow-up with choices.
2. **Compute** — `lib/scheduling.ts` finds gaps against the user's work hours, lunch and buffer preferences, scores slots, and detects overlaps, back-to-back runs, overloaded days and missing focus blocks.
3. **Explain and confirm** — the model receives computed results and writes a short explanation. Event drafts show the exact title, time and duration, and create only after the user confirms.

All date math runs in the viewer's IANA timezone (`lib/timezone.ts`), not the server's.

## Project map

```
app/
  page.tsx                     calendar app (demo by default)
  login/page.tsx               sign-in with demo fallback
  settings/page.tsx            account, connection, disconnect, AI status
  auth/google/start/route.ts   Google OAuth start (state + PKCE)
  auth/callback/route.ts       verify state, exchange code, store tokens, issue session
  auth/signout/route.ts        clear the session cookie
  api/calendar/events/route.ts demo or Google events for a range; POST adds one event
  api/calendar/disconnect/route.ts
  api/ai/assistant/route.ts    validated assistant requests
components/
  calendar-workspace.tsx       state, fetching, assistant thread
  calendar-inner.tsx           FullCalendar grid
  assistant-panel.tsx          prompts, messages, slot + conflict cards
  meeting-panel.tsx            event details and brief
  sidebar.tsx, top-bar.tsx, demo-banner.tsx, right-panel.tsx
lib/
  scheduling.ts                slot finding, conflicts, stats
  timezone.ts                  Intl-based zoned date math
  demo-data.ts                 seeded week
  ai/assistant.ts              interpretation, narration, fallbacks
  google/calendar.ts           token refresh + events.list/insert + mapping
  google/oauth.ts              auth URL, PKCE exchange, ID token verification
  session.ts                   signed session + OAuth state cookies
  signed-cookie.ts             HMAC sign/verify helpers
  crypto.ts                    AES-256-GCM
  supabase/admin.ts            service-role Postgres client
supabase/migrations/0001_calendar_connections.sql
supabase/migrations/0002_ai_rate_limits.sql
```

## Writing back to Google

A suggested window or confirmed event draft posts to `POST /api/calendar/events`, which validates the range (5 minutes to 12 hours), requires a same-origin request and a signed-in session, then inserts the event on the viewer's `primary` calendar. Google sends invitations only when the user included attendee email addresses and confirmed the draft.

Event drafts include a title, date, start/end, duration, separate agenda and notes fields, location and optional attendee email addresses. Agenda and notes are saved in the event description. When attendees are included, the confirmation step says who will be invited and Google sends them invitations after creation. Rescheduling changes only the start and end of the selected event. Both actions require an explicit user choice and the `calendar.events` grant.

Demo mode never writes. It supports previews; adding a focus block or moving an event is available only on a connected live calendar.

## Scope

In: Google Calendar read + add, user-approved rescheduling, demo mode, day/week view, find time, meeting briefs, conflict review, personalized scheduling preferences, weekly planning, light/dark themes, settings.

Out: deleting events, discovering coworker availability, notifications for reschedules, multiple calendars.

Calendar scopes can require Google verification for public use; while the consent screen is in Testing, only listed test users can sign in, and refresh tokens may expire after about seven days. Demo mode keeps the app reviewable either way.
# cadence
