create table if not exists public.practice_sessions (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.practice_sessions enable row level security;
