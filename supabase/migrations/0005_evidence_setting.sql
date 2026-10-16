create table if not exists app_settings (
  id integer primary key default 1 check (id = 1),
  evidence_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into app_settings (id, evidence_enabled)
values (1, true)
on conflict (id) do nothing;

alter table app_settings enable row level security;
