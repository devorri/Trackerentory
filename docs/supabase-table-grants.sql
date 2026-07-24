-- TrackErentory: fix 401 "permission denied for table …" errors
-- Run once in Supabase Dashboard → SQL Editor → Run
--
-- The browser shows HTTP 401, but the real error is PostgreSQL error 42501:
-- the `anon` and `authenticated` API roles were never granted access to your tables.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- If you later enable Row Level Security, add policies too.
-- Without policies, RLS blocks all rows even when grants exist.
