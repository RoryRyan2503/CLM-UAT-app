-- Vendor seed data. Idempotent: safe to re-run.
insert into vendors (slug, name) values
  ('ironclad', 'Ironclad'),
  ('sirion', 'Sirion')
on conflict (slug) do nothing;
