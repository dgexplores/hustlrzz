-- Live interview persist needs elapsed seconds (app inserts duration_seconds).
alter table if exists interview_sessions
  add column if not exists duration_seconds integer not null default 0;
