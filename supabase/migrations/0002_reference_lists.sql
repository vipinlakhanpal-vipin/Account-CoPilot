-- Account CoPilot — reference target lists (your profiling workbook)
-- Adds list membership, ICP status and the verbatim profiling record to companies.
alter table public.companies add column if not exists lists text[] default '{}';
alter table public.companies add column if not exists icp_status text;
alter table public.companies add column if not exists profile jsonb;
alter table public.companies add column if not exists ref_sl_no int;
create index if not exists companies_icp_status_idx on public.companies(icp_status);
