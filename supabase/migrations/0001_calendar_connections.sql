-- Cadence: users + encrypted Google calendar connections.
-- Supabase is used as Postgres only. Authentication is performed directly
-- against Google, and the app issues its own signed session cookie, so there
-- are no auth.users references and no dependency on Supabase Auth.
--
-- Run in the Supabase SQL Editor, or via `supabase db push`.
-- If you previously ran the Supabase-Auth version of this file, drop
-- public.calendar_connections and public.profiles first (it will not
-- typecheck against this schema).

create extension if not exists "pgcrypto";

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text,
  name text,
  picture text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.calendar_connections (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  provider text not null default 'google',
  google_email text,
  scopes text[] not null default '{}',
  refresh_token_enc text,
  access_token_enc text,
  access_token_expires_at timestamptz,
  status text not null default 'connected',
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_connections_status_idx
  on public.calendar_connections (status);

alter table public.app_users enable row level security;
alter table public.calendar_connections enable row level security;

-- Deliberate: RLS on, zero policies, and no grants for anon or authenticated.
-- The app never ships a Supabase key to the browser; only the service role
-- (server route handlers) can read these tables. Tokens are AES-256-GCM
-- ciphertext, so even a database dump alone does not expose them.
revoke all on public.app_users from anon, authenticated;
revoke all on public.calendar_connections from anon, authenticated;
