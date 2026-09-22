-- Shared sliding-window rate limiter (multi-instance safe).
-- Counters live in Postgres so every backend replica sees the same budget.

create table if not exists public.rate_limit_events (
  key text not null,
  ts timestamptz not null default now()
);

create index if not exists rate_limit_events_key_ts
  on public.rate_limit_events (key, ts);

-- Deny all direct table access; only the service role (via RPC below) touches it.
alter table public.rate_limit_events enable row level security;

create or replace function public.rate_limit_allow(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  event_count integer;
  oldest_ts timestamptz;
begin
  delete from public.rate_limit_events
   where key = p_key
     and ts < now() - make_interval(secs => p_window_seconds);

  select count(*), min(ts) into event_count, oldest_ts
    from public.rate_limit_events
   where key = p_key;

  if event_count >= p_limit then
    return query
      select false,
             greatest(1, ceil(extract(epoch from (oldest_ts + make_interval(secs => p_window_seconds) - now())))::integer);
    return;
  end if;

  insert into public.rate_limit_events (key, ts) values (p_key, now());
  return query select true, 0;
end;
$$;

revoke all on function public.rate_limit_allow(text, integer, integer) from public;
revoke all on function public.rate_limit_allow(text, integer, integer) from anon;
revoke all on function public.rate_limit_allow(text, integer, integer) from authenticated;
grant execute on function public.rate_limit_allow(text, integer, integer) to service_role;
