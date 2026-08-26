-- Shared company intelligence cache + assessment attempts.
-- Run after 20260815180000_resume_analyzer.sql.

-- --------------------------------------------------------------------------- --
-- Company intelligence: how a target company hires, cached and auto-refreshed.
-- --------------------------------------------------------------------------- --
create table if not exists company_intelligence (
  id bigint generated always as identity primary key,
  company_key text unique not null,
  company_name text not null,
  data jsonb not null default '{}'::jsonb,
  confidence text not null default 'medium',
  fetched_at timestamptz not null default now()
);

alter table company_intelligence enable row level security;
drop policy if exists "company_intelligence_service_only" on company_intelligence;

create index if not exists company_intelligence_fetched_idx
  on company_intelligence(company_key, fetched_at desc);

-- --------------------------------------------------------------------------- --
-- Assessment attempts (aptitude / technical / judgment rounds).
-- Answer keys live only inside the "rounds" jsonb and never reach clients
-- before submission; the backend filters every read by user_id.
-- --------------------------------------------------------------------------- --
create table if not exists assessment_attempts (
  id bigint generated always as identity primary key,
  attempt_id text unique not null,
  user_id uuid not null,
  role text not null,
  company text not null default '',
  level text not null default 'mid',
  rounds jsonb not null default '[]'::jsonb,
  current_round integer not null default 0,
  round_scores jsonb not null default '[]'::jsonb,
  total_percent integer,
  band text,
  status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  unique(attempt_id, user_id)
);

alter table assessment_attempts enable row level security;
drop policy if exists "assessment_attempts_owner_all" on assessment_attempts;
create policy "assessment_attempts_owner_all" on assessment_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists assessment_attempts_owner_idx
  on assessment_attempts(user_id, created_at desc);

-- --------------------------------------------------------------------------- --
-- Widen the knowledge source-type allowlist so condensed company intelligence
-- can ground candidate RAG retrieval.
-- --------------------------------------------------------------------------- --
alter table knowledge_documents drop constraint if exists knowledge_documents_source_type_check;
alter table knowledge_documents add constraint knowledge_documents_source_type_check
  check (source_type in ('resume', 'portfolio', 'notes', 'session_report', 'company_intelligence'));
