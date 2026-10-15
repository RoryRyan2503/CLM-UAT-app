alter table test_results
  add column if not exists feature_adequate boolean,
  add column if not exists improvement_needed boolean,
  add column if not exists improvement_description text,
  add column if not exists feature_user_friendly boolean;