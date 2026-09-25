-- Account CoPilot — verified revenue and listing status (ICP no longer requires a stock listing)
alter table public.companies add column if not exists listing_status text;          -- Listed | Private | Government-owned | Subsidiary of listed group | Unknown
alter table public.companies add column if not exists verified_revenue_usd_m numeric;
alter table public.companies add column if not exists verified_revenue_fy text;
alter table public.companies add column if not exists verified_revenue_type text;   -- Net revenue | Gross revenue | Total operating income | Estimate
alter table public.companies add column if not exists verified_revenue_source text;
alter table public.companies add column if not exists verified_revenue_url text;
alter table public.companies add column if not exists verified_revenue_status text;  -- FACT | LIKELY | UNVERIFIED | UNKNOWN
