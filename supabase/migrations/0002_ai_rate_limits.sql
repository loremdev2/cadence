-- Shared counters for the server-side AI route limiter.
-- Bucket values are keyed hashes for people/IPs; no raw identity is stored.

create table if not exists public.ai_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count >= 0)
);

alter table public.ai_rate_limits enable row level security;
revoke all on public.ai_rate_limits from anon, authenticated;

create or replace function public.consume_ai_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_started timestamptz;
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) > 200 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.ai_rate_limits as current_window (bucket, window_started_at, hit_count)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    window_started_at = case
      when current_window.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then v_now
      else current_window.window_started_at
    end,
    hit_count = case
      when current_window.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then 1
      else current_window.hit_count + 1
    end
  returning current_window.window_started_at, current_window.hit_count
  into v_started, v_hits;

  return query
    select
      v_hits <= p_limit,
      greatest(
        1,
        ceil(extract(epoch from (v_started + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer
      );
end;
$$;

revoke all on function public.consume_ai_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_rate_limit(text, integer, integer) to service_role;
