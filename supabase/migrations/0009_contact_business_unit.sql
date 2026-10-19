-- A contact can belong to a property or business unit under the account (for example Atlantis The Palm under Kerzner).
-- Empty = the account itself (group level). Claude-owned: never set on rows from the user's workbook.
alter table public.contacts add column if not exists business_unit text;
