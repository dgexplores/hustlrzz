-- Bring-your-own-key provider credentials, one row per user per provider.
--
-- encrypted_key holds AES-256-GCM ciphertext only. The plaintext exists solely
-- in memory for the duration of one provider call. key_hint is the last four
-- characters, for display, and is not enough to reconstruct a key.
create table if not exists user_ai_keys (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  provider text not null,
  encrypted_key text not null,
  key_hint text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists user_ai_keys_user_id_idx on user_ai_keys (user_id);

-- The service role reaches this table, so RLS is not relied on for isolation;
-- every read and write is scoped by user_id in application code. Enable RLS
-- anyway so a future anon/authenticated client cannot read it by accident.
alter table user_ai_keys enable row level security;
