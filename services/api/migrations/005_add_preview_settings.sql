insert into app_settings (key, value)
values
  ('preview_enabled', 'true'),
  ('preview_interval', '6')
on conflict (key) do update set value = excluded.value, updated_at = now();
