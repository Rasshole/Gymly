-- Ensure user_push_tokens has device_id for per-device management/toggles.
-- The table is created in 20260610120000. On a fresh local database this
-- earlier migration is a no-op; databases that already had the table still
-- receive the column and index.

do $$
begin
  if to_regclass('public.user_push_tokens') is null then
    return;
  end if;

  alter table public.user_push_tokens
    add column if not exists device_id text;

  create index if not exists user_push_tokens_device_idx
    on public.user_push_tokens (user_id, device_id)
    where device_id is not null;
end $$;
