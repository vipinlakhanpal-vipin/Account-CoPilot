-- Time spent per page (v4.22): the heartbeat moves last_seen on the person's current page row; time on a page = last_seen - created_at.
alter table public.activity_log add column if not exists last_seen timestamptz;
