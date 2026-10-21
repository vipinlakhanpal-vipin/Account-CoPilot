-- v6.29: downloads (Master Book, PDF, Excel) are a per-person switch. The Super Admin always can; everyone else only when can_download is true.
-- Applied 2026-10-21 through the Supabase connector. Nardus is the first person switched on.
alter table public.user_access add column if not exists can_download boolean not null default false;
update public.user_access set can_download = true, updated_by = 'v6.29: downloads opened for Nardus', updated_at = now() where lower(email) = 'nardus@scp-worldwide.com';
