-- Entity type: split Branch into Branch (regional) and Foreign Branch (v3.47). Run once in Supabase → SQL Editor.
-- Matches the real ICP distinction: a branch of another Middle East company reads differently than a branch of a
-- company headquartered outside the region entirely. Existing rows (all 'Unknown' so far) are unaffected.
alter table public.companies drop constraint if exists companies_entity_type_check;
alter table public.companies
  add constraint companies_entity_type_check
  check (entity_type in ('Regional HQ', 'Branch', 'Foreign Branch', 'Unknown'));
