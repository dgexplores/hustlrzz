-- Candidate-owned semantic knowledge base. Run after the initial schema.
create extension if not exists vector;

create table if not exists knowledge_documents (
  id bigint generated always as identity primary key,
  document_id text unique not null,
  user_id uuid not null,
  title text not null,
  source_type text not null check (source_type in ('resume', 'portfolio', 'notes', 'session_report')),
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
