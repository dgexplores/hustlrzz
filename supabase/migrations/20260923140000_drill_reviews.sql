-- Phase 2 T9 — spaced-repetition review state.
-- One row per (user, skill). Seeded day-0 (due immediately) from the weakness
-- digest on first read; `good` advances interval_index along the [1, 3, 7, 14]
-- day ladder, `again` resets to index 0 (due in 1 day). Reads/writes go
-- through the service-role API (auth + owner checks in the endpoint) —
-- mirrors report_feedback / rate_limit_events: RLS on, no client policies.

create table if not exists public.drill_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  skill text not null,
  interval_index integer not null default 0 check (interval_index >= 0),
  due_at timestamptz not null default now(),
  last_result text check (last_result is null or last_result in ('again', 'good')),
  streak integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, skill)
);

create index if not exists drill_reviews_user_due_idx
  on public.drill_reviews (user_id, due_at);

-- Deny all direct client access; backend reads/writes with the service role.
alter table public.drill_reviews enable row level security;
