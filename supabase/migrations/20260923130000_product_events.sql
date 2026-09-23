-- Phase 2 T8 — privacy-safe product funnel events.
-- Allowlisted event names only. props jsonb is constrained by the API to
-- non-string primitives (numbers/booleans/nulls) under short identifier keys —
-- no free text, no resume, no transcript. Deny all direct client access;
-- backend writes with the service role after auth (mirrors report_feedback /
-- rate_limit_events).

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null
    check (event_name in (
      'prepare_started',
      'prepare_completed',
      'interview_completed',
      'feedback_submitted'
    )),
  user_id text,
  occurred_at timestamptz not null default now(),
  props jsonb not null default '{}'::jsonb
);

create index if not exists product_events_event_name_idx
  on public.product_events (event_name, occurred_at);

alter table public.product_events enable row level security;
