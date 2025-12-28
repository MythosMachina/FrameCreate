alter table generation_jobs
  add column if not exists lora_weights real[];
