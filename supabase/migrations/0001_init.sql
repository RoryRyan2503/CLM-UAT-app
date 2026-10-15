-- CLM Vendor UAT MVP — initial schema
-- SECURITY_NOTE: RLS is enabled on every table with no policies granted to anon/authenticated.
-- This denies all direct PostgREST access from the browser (anon key) by default. All
-- application reads/writes go through Next.js server code using the Supabase service-role
-- key, which bypasses RLS; authorization (tester ownership, admin role) is enforced in
-- application code (lib/auth/*, lib/data/*) before any query runs. This avoids relying on
-- auth.uid()-based policies, which don't apply to testers (they authenticate via a custom
-- opaque session cookie, not Supabase Auth).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Testers & sessions
-- ---------------------------------------------------------------------------
create table testers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  department text,
  persona text,
  access_code_hash text not null,
  access_code_lookup text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index testers_name_idx on testers (lower(name));

create table tester_sessions (
  id uuid primary key default gen_random_uuid(),
  tester_id uuid not null references testers (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index tester_sessions_tester_id_idx on tester_sessions (tester_id);

create table login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_identifier_created_idx on login_attempts (identifier, created_at);

-- Admins authenticate via Supabase Auth; this table just marks which auth.users are admins.
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vendors & canonical test definitions
-- ---------------------------------------------------------------------------
create table vendors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table test_cases (
  id uuid primary key default gen_random_uuid(),
  test_case_id text not null unique,
  functional_area text not null,
  persona text,
  scenario text not null,
  suggested_steps text not null,
  expected_result text not null,
  required_evidence text not null,
  source_row_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index test_cases_functional_area_idx on test_cases (functional_area);

-- ---------------------------------------------------------------------------
-- Assignments: one row per (tester, test_case, vendor)
-- ---------------------------------------------------------------------------
create table assignments (
  id uuid primary key default gen_random_uuid(),
  tester_id uuid not null references testers (id) on delete cascade,
  test_case_id uuid not null references test_cases (id) on delete cascade,
  vendor_id uuid not null references vendors (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tester_id, test_case_id, vendor_id)
);
create index assignments_tester_id_idx on assignments (tester_id);
create index assignments_test_case_id_idx on assignments (test_case_id);

-- ---------------------------------------------------------------------------
-- Results, comparisons, evidence, defects, history
-- ---------------------------------------------------------------------------
create table test_results (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references assignments (id) on delete cascade,
  actual_result text,
  status text not null default 'Not Started'
    check (status in (
      'Not Started', 'In Progress', 'Pass', 'Pass with Observation',
      'Fail', 'Blocked', 'Not Applicable', 'Retest Required'
    )),
  grade text check (grade in ('A', 'B', 'C', 'D', 'F', 'N/A')),
  severity text check (severity in ('Critical', 'High', 'Medium', 'Low', 'Informational', 'N/A')),
  defect_id uuid,
  workaround_notes text,
  usability_rating integer check (usability_rating between 1 and 5),
  configuration_required boolean,
  vendor_assistance_required boolean,
  blocked_reason text,
  blocked_owner text,
  blocked_target_date date,
  started_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1,
  updated_by_tester_id uuid references testers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  test_result_id uuid not null references test_results (id) on delete cascade,
  kind text not null check (kind in ('file', 'url')),
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  url text,
  created_at timestamptz not null default now(),
  created_by_tester_id uuid references testers (id) on delete set null,
  constraint evidence_kind_payload_chk check (
    (kind = 'file' and storage_path is not null) or
    (kind = 'url' and url is not null)
  )
);
create index evidence_test_result_id_idx on evidence (test_result_id);

create table defects (
  id uuid primary key default gen_random_uuid(),
  defect_code text not null unique,
  test_result_id uuid not null references test_results (id) on delete cascade,
  vendor_id uuid not null references vendors (id),
  title text not null,
  description text,
  severity text check (severity in ('Critical', 'High', 'Medium', 'Low', 'Informational', 'N/A')),
  status text not null default 'Open'
    check (status in ('Open', 'In Progress', 'Retest Required', 'Resolved', 'Closed')),
  retest_assignment_id uuid references assignments (id) on delete set null,
  created_by_tester_id uuid references testers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index defects_test_result_id_idx on defects (test_result_id);

alter table test_results
  add constraint test_results_defect_id_fkey
  foreign key (defect_id) references defects (id) on delete set null;

create table comparisons (
  id uuid primary key default gen_random_uuid(),
  tester_id uuid not null references testers (id) on delete cascade,
  test_case_id uuid not null references test_cases (id) on delete cascade,
  preferred_vendor text check (preferred_vendor in ('Ironclad', 'Sirion', 'Equal', 'Unable to Decide')),
  comments text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tester_id, test_case_id)
);

create table result_history (
  id uuid primary key default gen_random_uuid(),
  test_result_id uuid not null references test_results (id) on delete cascade,
  changed_by_tester_id uuid references testers (id) on delete set null,
  changed_by_admin boolean not null default false,
  change_type text not null,
  previous_values jsonb,
  new_values jsonb,
  version integer not null,
  created_at timestamptz not null default now()
);
create index result_history_test_result_id_idx on result_history (test_result_id);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  imported_by uuid references admin_users (id) on delete set null,
  row_count integer not null,
  created_count integer not null,
  updated_count integer not null,
  error_count integer not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at / version maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger testers_set_updated_at before update on testers
  for each row execute function set_updated_at();
create trigger test_cases_set_updated_at before update on test_cases
  for each row execute function set_updated_at();
create trigger test_results_set_updated_at before update on test_results
  for each row execute function set_updated_at();
create trigger comparisons_set_updated_at before update on comparisons
  for each row execute function set_updated_at();
create trigger defects_set_updated_at before update on defects
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, deny-by-default (see SECURITY_NOTE above).
-- ---------------------------------------------------------------------------
alter table testers enable row level security;
alter table tester_sessions enable row level security;
alter table login_attempts enable row level security;
alter table admin_users enable row level security;
alter table vendors enable row level security;
alter table test_cases enable row level security;
alter table assignments enable row level security;
alter table test_results enable row level security;
alter table evidence enable row level security;
alter table defects enable row level security;
alter table comparisons enable row level security;
alter table result_history enable row level security;
alter table import_batches enable row level security;
