-- Supabase Storage bucket + policy for evidence files.
-- The bucket is private; all reads/writes happen through signed URLs generated server-side
-- (see lib/data/evidence.ts) after an application-level ownership/role check. No anon/
-- authenticated Storage policies are granted, matching the deny-by-default posture of the
-- database schema.
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;
