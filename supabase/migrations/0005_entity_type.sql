-- Entity type (v3.46). Run once in Supabase → SQL Editor. Safe to re-run.
-- Captures whether a company is itself a Regional HQ (headquartered in the Middle East, the entity the ICP targets)
-- or a Branch (a local presence of a company whose real headquarters is elsewhere, regional or foreign) — so the
-- "group HQs only, no foreign branches" ICP rule is visible per company, not just applied silently during discovery.
alter table public.companies
  add column if not exists entity_type text not null default 'Unknown'
  check (entity_type in ('Regional HQ', 'Branch', 'Unknown'));
