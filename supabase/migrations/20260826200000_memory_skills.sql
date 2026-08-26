-- Memory: persist skill gaps/strengths for adaptive follow-ups.
-- Adds columns to assessment_attempts so the next session can bias toward weak areas.
alter table if exists assessment_attempts
  add column if not exists gap_skills jsonb default '[]'::jsonb,
  add column if not exists strength_skills jsonb default '[]'::jsonb;
