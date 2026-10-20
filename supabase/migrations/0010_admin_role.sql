-- Roles (v5.17): super_admin (the owner: everything, including downloads and the Master Book), admin (everything except downloads), standard (own regions).
alter table public.user_access drop constraint if exists user_access_role_check;
alter table public.user_access add constraint user_access_role_check check (role in ('super_admin', 'admin', 'standard'));
create or replace function public.app_is_super() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_access where user_id = auth.uid() and role in ('super_admin', 'admin'))
$$;
-- Run AFTER v5.17 is deployed (the old app does not know the role 'admin'); the Team page can do the same per person.
-- update public.user_access set role = 'admin', updated_by = 'v5.17 roles: Admin', updated_at = now() where email in ('pavel@scp-worldwide.com', 'henk@scp-worldwide.com', 'kevin@scp-worldwide.com') and role = 'super_admin';
