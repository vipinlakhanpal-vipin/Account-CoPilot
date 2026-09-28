-- Region access & roles (v1.53). Run once in Supabase → SQL Editor. Safe to re-run.
--   Super Admin : sees and edits every region (consolidated view), manages the team, engine and all ICPs.
--   Standard    : sees only the companies (and their contacts, sources, signals…) in their assigned region(s),
--                 and can change only their region's ICP (through the app). Cannot change settings directly.
-- The app's server also scopes every page and export by the same rules; these policies stop anyone going around the app.

create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'standard' check (role in ('super_admin', 'standard')),
  regions text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.user_access enable row level security;

-- Everyone who already has an account when this runs becomes a Super Admin (so nobody is locked out).
insert into public.user_access (user_id, email, role, regions, updated_by)
select id, coalesce(email, ''), 'super_admin', '{}', 'migration 0004'
from auth.users on conflict (user_id) do nothing;

-- Region of a company's country — mirrors regionOf() in lib/icpDefinition.mjs (unknown countries count as UAE).
create or replace function public.app_region_of(c text) returns text language sql immutable as $$
  select case
    when lower(coalesce(c, '')) in ('uae', 'u.a.e.', 'united arab emirates', '') then 'UAE'
    when lower(c) in ('ksa', 'saudi arabia', 'saudi') then 'KSA'
    when lower(c) = 'qatar' then 'Qatar'
    when lower(c) = 'kuwait' then 'Kuwait'
    when lower(c) = 'oman' then 'Oman'
    when lower(c) = 'bahrain' then 'Bahrain'
    when lower(c) = 'egypt' then 'Egypt'
    when lower(c) in ('usa', 'us', 'united states') then 'USA'
    when lower(c) in ('europe', 'uk', 'united kingdom', 'germany', 'france', 'netherlands', 'switzerland', 'spain', 'italy',
                      'ireland', 'belgium', 'sweden', 'denmark', 'norway') then 'Europe'
    else 'UAE' end
$$;

create or replace function public.app_is_super() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_access where user_id = auth.uid() and role = 'super_admin')
$$;
create or replace function public.app_regions() returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select regions from public.user_access where user_id = auth.uid()), '{}')
$$;
create or replace function public.app_can_see_country(c text) returns boolean language sql stable as $$
  select public.app_is_super() or public.app_region_of(c) = any (public.app_regions())
$$;

-- user_access: you can read your own row; Super Admins read all. Changes only through the app's server (service role).
drop policy if exists "own access" on public.user_access;
create policy "own access" on public.user_access for select to authenticated using (user_id = auth.uid() or public.app_is_super());

-- companies: read / edit only in your regions.
drop policy if exists "team read" on public.companies;
drop policy if exists "region read" on public.companies;
create policy "region read" on public.companies for select to authenticated using (public.app_can_see_country(country));
drop policy if exists "team edit companies" on public.companies;
drop policy if exists "region edit companies" on public.companies;
create policy "region edit companies" on public.companies for update to authenticated
  using (public.app_can_see_country(country)) with check (public.app_can_see_country(country));

-- Rows linked to a company: visible only when the company is visible.
do $$
declare t text;
begin
  foreach t in array array['contacts', 'sources', 's2p_signals', 'technology_evidence', 'employment_history', 'conflicts', 'research_runs'] loop
    execute format('drop policy if exists "team read" on public.%I', t);
    execute format('drop policy if exists "region read" on public.%I', t);
    execute format('create policy "region read" on public.%I for select to authenticated using (
      public.app_is_super() or exists (select 1 from public.companies c where c.id = %I.company_id))', t, t);
  end loop;
end $$;
drop policy if exists "team edit contacts" on public.contacts;
drop policy if exists "region edit contacts" on public.contacts;
create policy "region edit contacts" on public.contacts for update to authenticated
  using (public.app_is_super() or exists (select 1 from public.companies c where c.id = contacts.company_id));
drop policy if exists "team edit conflicts" on public.conflicts;
drop policy if exists "region edit conflicts" on public.conflicts;
create policy "region edit conflicts" on public.conflicts for update to authenticated
  using (public.app_is_super() or exists (select 1 from public.companies c where c.id = conflicts.company_id));

-- research_observations belong to a run.
drop policy if exists "team read" on public.research_observations;
drop policy if exists "region read" on public.research_observations;
create policy "region read" on public.research_observations for select to authenticated using (
  public.app_is_super() or exists (select 1 from public.research_runs r where r.id = research_observations.run_id));

-- settings (ICP definition, engine, team defaults): everyone signed in may read; only Super Admins may write directly.
-- Standard users change their region's ICP through the app, which checks their region on the server.
drop policy if exists "team edit settings" on public.settings;
drop policy if exists "super edit settings" on public.settings;
create policy "super edit settings" on public.settings for all to authenticated using (public.app_is_super()) with check (public.app_is_super());
