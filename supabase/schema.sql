-- hustlrzzv2 schema (run once in Supabase SQL editor)
-- Tables rely on Row-Level Security + auth.uid().

-- Interview prep workflows (JD + resume analysis outputs)
create table if not exists workflows (
  id bigint generated always as identity primary key,
  workflow_id text unique not null,
  user_id uuid not null,
  title text,
  company text default '',
  questions jsonb not null default '[]',
  answers jsonb not null default '[]',
  match jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table workflows enable row level security;
create policy "workflows_owner_all" on workflows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Live interview sessions + scored coaching report
create table if not exists interview_sessions (
  id bigint generated always as identity primary key,
  session_id text unique not null,
  user_id uuid not null,
  workflow_id text not null,
  transcript jsonb not null default '[]',
  report jsonb not null default '{}',
  is_audio boolean not null default false,
  created_at timestamptz not null default now()
);

alter table interview_sessions enable row level security;
create policy "sessions_own_all" on interview_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- User profiles
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  photo_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "profiles_own_all" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, photo_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
          coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Candidate-owned semantic knowledge base (optional RAG feature).
-- Requires the Gemini embedding variables in backend/.env and is safe to run
-- with the initial schema or later as a schema upgrade.
create extension if not exists vector;

create table if not exists knowledge_documents (
  id bigint generated always as identity primary key,
  document_id text unique not null,
  user_id uuid not null,
  title text not null,
  source_type text not null check (source_type in ('resume', 'portfolio', 'notes', 'session_report', 'company_intelligence')),
  content_hash text not null,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, content_hash)
);

create table if not exists knowledge_chunks (
  id bigint generated always as identity primary key,
  document_id text not null references knowledge_documents(document_id) on delete cascade,
  user_id uuid not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(768) not null,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);

alter table knowledge_documents enable row level security;
alter table knowledge_chunks enable row level security;
drop policy if exists "knowledge_documents_owner_all" on knowledge_documents;
drop policy if exists "knowledge_chunks_owner_all" on knowledge_chunks;
create policy "knowledge_documents_owner_all" on knowledge_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "knowledge_chunks_owner_all" on knowledge_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists knowledge_documents_owner_idx on knowledge_documents(user_id, created_at desc);
create index if not exists knowledge_chunks_owner_idx on knowledge_chunks(user_id, document_id);
create index if not exists knowledge_chunks_embedding_hnsw on knowledge_chunks using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 128);

create or replace function match_knowledge_chunks(
  query_embedding vector(768),
  match_user_id uuid,
  match_count integer default 5
)
returns table(document_id text, source_title text, source_type text, content text, similarity double precision)
language sql stable security invoker set search_path = public as $$
  select c.document_id, d.title, d.source_type, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from knowledge_chunks c
  join knowledge_documents d on d.document_id = c.document_id
  where c.user_id = match_user_id and d.user_id = match_user_id
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 10));
$$;

-- Shared company intelligence cache (service-role writes only; no client policy).
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

-- Assessment attempts (aptitude / technical / judgment rounds).
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
