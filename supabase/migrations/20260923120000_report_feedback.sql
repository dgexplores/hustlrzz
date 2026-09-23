-- Phase 2 T4 — usefulness rating (launch gate).
-- Orchestrator decision: one rating per session_id. A second POST /feedback
-- for the same session upserts (replaces rating + comment) and returns 200 —
-- never 409. Ownership of the referenced interview session is enforced in the
-- API (owner-of-session check) before any write.

create table if not exists public.report_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id text not null unique,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists report_feedback_user_id_idx
  on public.report_feedback (user_id);

-- Deny all direct client access; backend reads/writes with the service role
-- (owner checks + rate limiting live in the API — mirrors rate_limit_events).
alter table public.report_feedback enable row level security;
