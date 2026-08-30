-- Persist the resume text and job description used to generate a workflow so
-- the live interview judge can ground its scoring in what the candidate
-- actually submitted, instead of always scoring against an empty context.
alter table if exists workflows
  add column if not exists resume_text text not null default '',
  add column if not exists job_description text not null default '';
