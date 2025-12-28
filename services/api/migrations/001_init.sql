create table if not exists model_assets (
  id serial primary key,
  kind text not null,
  name text not null,
  path text not null unique,
  size_bytes bigint,
  sha256 text,
  mtime bigint,
  base_model text,
  trigger_words text[],
  tags text[],
  metadata jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists model_assets_kind_idx on model_assets (kind);
create index if not exists model_assets_name_idx on model_assets (name);

create table if not exists generation_jobs (
  id serial primary key,
  status text not null,
  prompt text not null,
  negative_prompt text,
  prompt_variants jsonb,
  width integer not null,
  height integer not null,
  steps integer not null,
  cfg_scale real not null,
  sampler text,
  seed bigint,
  batch_count integer not null default 1,
  model_asset_id integer references model_assets (id) on delete set null,
  lora_asset_ids integer[],
  progress real not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists generation_jobs_status_idx on generation_jobs (status);
create index if not exists generation_jobs_created_idx on generation_jobs (created_at desc);

create table if not exists generation_outputs (
  id serial primary key,
  job_id integer not null references generation_jobs (id) on delete cascade,
  file_path text not null,
  width integer not null,
  height integer not null,
  seed bigint,
  created_at timestamptz not null default now()
);

create index if not exists generation_outputs_job_idx on generation_outputs (job_id);
