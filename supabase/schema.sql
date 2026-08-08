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
  id uuid generated always as identity primary key,
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
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();