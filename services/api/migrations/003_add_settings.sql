create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values
  ('default_sampler', 'euler'),
  ('default_scheduler', 'karras')
on conflict (key) do nothing;
