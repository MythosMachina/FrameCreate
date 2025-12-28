alter table if exists generation_jobs
  add column if not exists scheduler text;
