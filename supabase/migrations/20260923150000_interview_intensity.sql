-- Phase 2 T11 — interview intensity (easy | standard | hard).
-- Default 'standard' keeps pre-T11 rows valid and equal to prior behaviour.
-- The API validates the enum (422 otherwise); the check constraint is defense
-- in depth for direct/service-role writes.

alter table if exists interview_sessions
  add column if not exists intensity text not null default 'standard';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'interview_sessions_intensity_check'
      and conrelid = 'public.interview_sessions'::regclass
  ) then
    alter table public.interview_sessions
      add constraint interview_sessions_intensity_check
      check (intensity in ('easy', 'standard', 'hard'));
  end if;
end $$;
