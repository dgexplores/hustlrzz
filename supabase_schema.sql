-- ============================================================
-- Hustlrzz Supabase schema (Firestore -> Postgres migration)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- Column names intentionally keep the app's camelCase JSON keys
-- so the backend API contract stays byte-for-byte identical.
-- ============================================================

-- ---------- users (profile) ----------
create table if not exists public.users (
  user_id         text primary key,
  "name"          text,
  email           text,
  "photoURL"      text,
  "linkedinLink"  text,
  "githubLink"    text,
  "portfolioLink" text,
  "additionalInfo" text,
  "createAt"      timestamptz default now()
);

-- ---------- workflows ----------
create table if not exists public.workflows (
  id                  text primary key default gen_random_uuid()::text,
  user_id             text not null references public.users(user_id) on delete cascade,
  title               text,
  "personalExperience" jsonb,
  "recommendedQAs"     jsonb,
  "createAt"          timestamptz default now()
);
create index if not exists idx_workflows_user on public.workflows (user_id);

-- ---------- interviews (sessions nested under workflows) ----------
create table if not exists public.interviews (
  id               text primary key default gen_random_uuid()::text,
  user_id          text not null references public.users(user_id) on delete cascade,
  workflow_id      text references public.workflows(id) on delete cascade,
  transcript       jsonb,
  duration_minutes int,
  feedback         jsonb,
  "createAt"       timestamptz default now()
);
create index if not exists idx_interviews_user_workflow on public.interviews (user_id, workflow_id);

-- ---------- bqs (system data) ----------
create table if not exists public.bqs (
  id       text primary key,
  question text not null,
  category text,
  tags     jsonb
);

-- ---------- problems (system data) ----------
create table if not exists public.problems (
  id               text primary key,
  title            text,
  slug             text,
  difficulty       text,
  category         text,
  topics           jsonb,
  links            jsonb,
  stats            jsonb,
  statement        jsonb,
  hints            jsonb,
  solutions        jsonb,
  best_solution    jsonb,
  similar_questions jsonb
);

-- ============================================================
-- Row-Level Security
-- Backend (service role) bypasses RLS. The web client talks to
-- the backend API, so these policies are defense-in-depth that
-- guarantee per-user isolation even if client keys leak.
-- ============================================================
alter table public.users     enable row level security;
alter table public.workflows enable row level security;
alter table public.interviews enable row level security;
alter table public.bqs       enable row level security;
alter table public.problems  enable row level security;

-- users: only the owner
create policy "users owner select" on public.users
  for select using (auth.uid() = user_id);
create policy "users owner insert" on public.users
  for insert with check (auth.uid() = user_id);
create policy "users owner update" on public.users
  for update using (auth.uid() = user_id);
create policy "users owner delete" on public.users
  for delete using (auth.uid() = user_id);

-- workflows: only the owner
create policy "workflows owner all" on public.workflows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- interviews: only the owner
create policy "interviews owner all" on public.interviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- bqs / problems: authenticated users may read; writes only via service role
create policy "bqs read authed" on public.bqs
  for select using (auth.role() = 'authenticated');
create policy "problems read authed" on public.problems
  for select using (auth.role() = 'authenticated');
