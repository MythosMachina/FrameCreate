alter table generation_outputs
  add column if not exists prompt text,
  add column if not exists negative_prompt text;
