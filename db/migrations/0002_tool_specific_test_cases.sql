alter table test_cases
  add column if not exists use_case text not null default '',
  add column if not exists sirion_steps text not null default '',
  add column if not exists sirion_feature text not null default '',
  add column if not exists sirion_availability text not null default 'Not Specified'
    check (sirion_availability in ('Available and Configured', 'Not Configured', 'Not Available', 'Not Specified')),
  add column if not exists ironclad_steps text not null default '',
  add column if not exists ironclad_feature text not null default '',
  add column if not exists ironclad_availability text not null default 'Not Specified'
    check (ironclad_availability in ('Available and Configured', 'Not Configured', 'Not Available', 'Not Specified')),
  add column if not exists is_active boolean not null default true;

update test_cases set use_case = scenario where use_case = '';
update test_cases set sirion_steps = suggested_steps where sirion_steps = '';
update test_cases set ironclad_steps = suggested_steps where ironclad_steps = '';alter table test_cases
  add column if not exists use_case text not null default '',
  add column if not exists sirion_steps text not null default '',
  add column if not exists sirion_feature text not null default '',
  add column if not exists sirion_availability text not null default 'Not Specified'
    check (sirion_availability in ('Available and Configured', 'Not Configured', 'Not Available', 'Not Specified')),
  add column if not exists ironclad_steps text not null default '',
  add column if not exists ironclad_feature text not null default '',
  add column if not exists ironclad_availability text not null default 'Not Specified'
    check (ironclad_availability in ('Available and Configured', 'Not Configured', 'Not Available', 'Not Specified')),
  add column if not exists is_active boolean not null default true;

update test_cases
set use_case = scenario
where use_case = '';

update test_cases
set sirion_steps = suggested_steps
where sirion_steps = '';

update test_cases
set ironclad_steps = suggested_steps
where ironclad_steps = '';