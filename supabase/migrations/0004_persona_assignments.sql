create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into personas (name)
select distinct trim(persona)
from testers
where persona is not null and trim(persona) <> ''
on conflict (name) do nothing;

insert into personas (name)
select distinct trim(persona)
from test_cases
where persona is not null and trim(persona) <> ''
on conflict (name) do nothing;

alter table testers
  add column if not exists persona_id uuid references personas (id) on delete set null;

update testers t
set persona_id = p.id
from personas p
where t.persona_id is null
  and t.persona is not null
  and trim(t.persona) = p.name;

create table if not exists persona_test_cases (
  persona_id uuid not null references personas (id) on delete cascade,
  test_case_id uuid not null references test_cases (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (persona_id, test_case_id)
);
create index if not exists persona_test_cases_test_case_id_idx on persona_test_cases (test_case_id);

alter table assignments
  add column if not exists is_active boolean not null default true;
create index if not exists assignments_tester_active_idx on assignments (tester_id, is_active);

alter table personas enable row level security;
alter table persona_test_cases enable row level security;