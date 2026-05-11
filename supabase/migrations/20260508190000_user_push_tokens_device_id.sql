-- Ensure user_push_tokens has device_id for per-device management/toggles.

alter table public.user_push_tokens
  add column if not exists device_id text;

create index if not exists user_push_tokens_device_idx
  on public.user_push_tokens (user_id, device_id)
  where device_id is not null;

