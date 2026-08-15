-- Resume Analyzer: structured results only. Raw resume files and extracted text
-- are intentionally never persisted by this schema.
create table if not exists resume_usage (
  id bigint generated always as identity primary key,
  user_id uuid unique not null,
  free_analyses_used integer not null default 0 check (free_analyses_used >= 0),
  paid_analyses_remaining integer not null default 0 check (paid_analyses_remaining >= 0),
  total_analyses integer not null default 0 check (total_analyses >= 0),
  last_reset_date text not null default to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
  last_analysis_at timestamptz
);

create table if not exists resume_analysis (
  id bigint generated always as identity primary key,
  analysis_id text unique not null,
  user_id uuid not null,
  request_hash text not null,
  resume_score integer not null check (resume_score between 0 and 100),
  extracted_skills jsonb not null default '[]',
  missing_skills jsonb not null default '[]',
  suggestions jsonb not null default '[]',
  analysis jsonb not null default '{}',
  jd_match jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(user_id, request_hash)
);

alter table resume_usage enable row level security;
alter table resume_analysis enable row level security;
create policy "resume_usage_owner_read" on resume_usage for select using (auth.uid() = user_id);
create policy "resume_analysis_owner_read" on resume_analysis for select using (auth.uid() = user_id);
create index if not exists resume_analysis_owner_created_idx on resume_analysis(user_id, created_at desc);

-- This function is the quota authority. The row lock means concurrent requests
-- cannot both spend the same free/paid credit. Reset date is explicitly IST.
create or replace function consume_resume_analysis(
  p_user_id uuid,
  p_free_limit integer default 3
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row resume_usage%rowtype;
  v_today text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  insert into resume_usage (user_id, last_reset_date)
  values (p_user_id, v_today)
  on conflict (user_id) do nothing;

  select * into v_row from resume_usage where user_id = p_user_id for update;
  if v_row.last_reset_date <> v_today then
    update resume_usage set free_analyses_used = 0, last_reset_date = v_today where user_id = p_user_id
    returning * into v_row;
  end if;

  if v_row.free_analyses_used < greatest(0, p_free_limit) then
    update resume_usage set free_analyses_used = free_analyses_used + 1,
      total_analyses = total_analyses + 1, last_analysis_at = now() where user_id = p_user_id;
    return jsonb_build_object('allowed', true, 'used_free', true);
  end if;
  if v_row.paid_analyses_remaining > 0 then
    update resume_usage set paid_analyses_remaining = paid_analyses_remaining - 1,
      total_analyses = total_analyses + 1, last_analysis_at = now() where user_id = p_user_id;
    return jsonb_build_object('allowed', true, 'used_free', false);
  end if;
  return jsonb_build_object('allowed', false, 'used_free', false);
end;
$$;

-- Compensates a failed provider or persistence operation after quota consumption.
create or replace function restore_resume_analysis(p_user_id uuid, p_used_free boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update resume_usage set
    free_analyses_used = case when p_used_free then greatest(0, free_analyses_used - 1) else free_analyses_used end,
    paid_analyses_remaining = case when p_used_free then paid_analyses_remaining else paid_analyses_remaining + 1 end,
    total_analyses = greatest(0, total_analyses - 1)
  where user_id = p_user_id;
end;
$$;

revoke all on function consume_resume_analysis(uuid, integer) from public;
revoke all on function restore_resume_analysis(uuid, boolean) from public;
