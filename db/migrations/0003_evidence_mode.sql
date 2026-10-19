alter table app_settings
  add column if not exists evidence_mode text not null default 'upload'
    check (evidence_mode in ('disabled', 'sharepoint', 'upload'));

update app_settings
set evidence_mode = case when evidence_enabled then 'upload' else 'disabled' end;