-- Inactive users (v5.33): a user with no activity for 15 days is suspended (reversible); the Super Admin then keeps, or archives and deletes, them.
-- user_archive holds the snapshot of an archived user so they can be reactivated; read and written only by the app's server (RLS on, no policies).
create table if not exists public.user_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  name text not null default '',
  role text not null default 'standard',
  regions text[] not null default '{}',
  last_active timestamptz,
  archived_at timestamptz not null default now(),
  archived_by text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  reactivated_at timestamptz
);
alter table public.user_archive enable row level security;
alter table public.user_access add column if not exists suspended_at timestamptz;
alter table public.user_access add column if not exists kept_at timestamptz;
