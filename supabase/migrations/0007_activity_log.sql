-- Activity log and who-is-online (v4.20). Run once in Supabase → SQL Editor. Safe to re-run.
-- Written and read only by the app's server (service role); RLS is on with no policies, so signed-in users cannot read these tables directly.
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text not null default '',
  kind text not null,
  detail text not null default '',
  path text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_user_idx on public.activity_log (user_id, created_at desc);
alter table public.activity_log enable row level security;

create table if not exists public.user_presence (
  user_id uuid primary key,
  email text not null default '',
  path text not null default '',
  last_seen timestamptz not null default now()
);
alter table public.user_presence enable row level security;
