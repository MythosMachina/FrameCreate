alter table generation_jobs
  add column if not exists prompt_variants jsonb;
