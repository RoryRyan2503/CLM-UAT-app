alter table app_settings
  add column if not exists overview_attention_enabled boolean not null default true;