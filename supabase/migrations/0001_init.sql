-- Account CoPilot — core schema
-- Run once in Supabase → SQL Editor (or `supabase db push`).
-- Principle: never overwrite observations. Research writes new rows (observations, sources, conflicts,
-- employment history); curated "current" values live on companies/contacts and keep their history.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- companies
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  company_name text not null,
  company_website text, domain text, country text default 'UAE', hq_city text,
  exchange text, ticker text, industry text,
  revenue_usd_m numeric, revenue_local text, revenue_fy text, revenue_source_url text,
  employee_range text, employee_source text,
  icp_fit text, icp_fit_reason text,
  ownership text, parent_company text, subsidiaries text, procurement_model text,
  erp text, erp_status text, erp_evidence text,
  existing_s2p_product text default 'Unknown', existing_s2p_detail text,
  s2p_platform_status text default 'Unknown', s2p_signal_level text default 'NO SIGNAL',
  s2p_strong_signals text, digital_transformation_signals text, procurement_transformation_signals text,
  relevant_technologies text, known_implementation_partner text, known_consulting_partner text,
  coupa_opportunity_type text default 'No Evidence', ariba_opportunity_type text default 'No Evidence',
  potential_opportunity text, board_phone text, board_phone_source text,
  account_notes text, research_confidence text, research_channel text default 'Claude',
  -- user input
  account_owner text, account_priority text, pitch_next_step text,
  first_found date default current_date, last_researched timestamptz, last_verified timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- ---------------------------------------------------------------- contacts
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  company_id uuid references public.companies(id) on delete cascade,
  full_name text not null, nationality text default 'Not Publicly Verified',
  title_verbatim text, standardized_title text, role_family text, contact_tier text,
  research_channel text, channel_state text, channel_source text,
  source text, source_type text, source_url text, second_source_url text, verification_status text,
  email text, email_status text, email_source text, email_confidence text, email_candidate text,
  phone text, phone_type text, phone_source text,
  location text, country text, linkedin_url text,
  employment_status text, previous_company text, previous_title text,
  s2p_contact_signal text, notes_contact text, confidence text,
  record_status text, claude_check text, is_reference boolean default false, company_ref_name text,
  -- user input
  owner text, warm_intro text, campaign text, review_status text, outreach_status text, reviewer_notes text,
  first_found date default current_date, last_researched timestamptz, last_verified timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists contacts_company_idx on public.contacts(company_id);

-- ---------------------------------------------------------------- evidence & history
create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  query text, company_name text, country text, depth text, roles text[],
  company_id uuid references public.companies(id) on delete set null,
  status text default 'queued',            -- queued | researching | extracting | reconciling | done | error
  error text, stats jsonb, requested_by text,
  started_at timestamptz default now(), finished_at timestamptz
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  run_id uuid references public.research_runs(id) on delete set null,
  related_contact text, source text, source_type text, source_tier text, url text,
  research_channel text default 'Claude', information_found text, evidence text,
  date_published text, date_accessed date default current_date, confidence text,
  supports_current_employment text, supports_current_title text, supports_s2p_status text,
  created_at timestamptz default now()
);

create table if not exists public.s2p_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  category text, signal text, level text, platform text, evidence text, source_url text, date text,
  research_channel text default 'Claude', created_at timestamptz default now()
);

create table if not exists public.technology_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  name text, category text, status text, evidence text, source_url text,
  created_at timestamptz default now()
);

create table if not exists public.employment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  full_name text, company text, title text, source text, source_url text,
  date_found date default current_date, determination text, evidence text,
  created_at timestamptz default now()
);

create table if not exists public.conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  entity text, field text, value_a text, source_a text, value_b text, source_b text,
  determination text, evidence text, resolution text,
  created_at timestamptz default now()
);

create table if not exists public.research_observations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.research_runs(id) on delete cascade,
  entity_type text, entity_id uuid, field text, old_value text, new_value text,
  source_url text, change_confidence text, observed_at timestamptz default now()
);

create table if not exists public.settings (
  key text primary key, value jsonb, updated_at timestamptz default now()
);
insert into public.settings(key, value) values ('contact_tiers', '[
  {"tier":"Tier 1","label":"Primary Decision Maker","examples":"CPO, CFO, CIO, CTO, CDO, Chief Transformation Officer"},
  {"tier":"Tier 2","label":"Executive Influencer","examples":"VP Procurement, Procurement Director, Finance Director, IT Director, Chief Supply Chain Officer"},
  {"tier":"Tier 3","label":"Functional Influencer","examples":"Head of Procurement, Sourcing Director, ERP Director, Procurement Transformation Lead, Head of Shared Services"},
  {"tier":"Tier 4","label":"Operational / Technical","examples":"Procurement Manager, S2P Manager, Coupa/Ariba Administrator, Procurement Systems Manager"}
]'::jsonb) on conflict (key) do nothing;

-- ---------------------------------------------------------------- security
-- Signed-in team members can read everything and edit their input fields.
-- Research writes use the service-role key on the server, which bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array['companies','contacts','research_runs','sources','s2p_signals','technology_evidence',
                           'employment_history','conflicts','research_observations','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team read" on public.%I', t);
    execute format('create policy "team read" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists "team edit companies" on public.companies;
create policy "team edit companies" on public.companies for update to authenticated using (true) with check (true);
drop policy if exists "team edit contacts" on public.contacts;
create policy "team edit contacts" on public.contacts for update to authenticated using (true) with check (true);
drop policy if exists "team edit conflicts" on public.conflicts;
create policy "team edit conflicts" on public.conflicts for update to authenticated using (true) with check (true);
drop policy if exists "team edit settings" on public.settings;
create policy "team edit settings" on public.settings for all to authenticated using (true) with check (true);
