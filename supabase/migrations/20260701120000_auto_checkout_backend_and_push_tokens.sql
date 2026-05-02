-- Launch-critical hardening:
-- 1) Server-side auto-checkout sweep + pg_cron schedule.
-- 2) Canonical push_tokens table (compat with existing user_push_tokens usage).

-- ---------------------------------------------------------------------------
-- PUSH TOKENS (canonical table expected by mobile + edge push sender)
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_tokens_user_token_uidx
  on public.push_tokens (user_id, token);

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id)
  where enabled = true;

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

create or replace function public.set_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_tokens_updated on public.push_tokens;
create trigger trg_push_tokens_updated
before update on public.push_tokens
for each row execute function public.set_push_tokens_updated_at();

-- Backfill from legacy table when present.
do $$
begin
  if to_regclass('public.user_push_tokens') is not null then
    insert into public.push_tokens (user_id, token, platform, enabled, created_at, updated_at)
    select
      u.user_id,
      u.token,
      case
        when u.platform in ('ios', 'android', 'web') then u.platform
        else 'ios'
      end as platform,
      coalesce(u.enabled, true),
      coalesce(u.created_at, now()),
      coalesce(u.updated_at, now())
    from public.user_push_tokens u
    on conflict (user_id, token) do update
      set
        enabled = excluded.enabled,
        platform = excluded.platform,
        updated_at = excluded.updated_at;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- SERVER-SIDE AUTO-CHECKOUT
-- Rules:
-- - force inactivity when session age > 4h
-- - away zone:
--   400-800m -> 15 min continuously away
--   >800m    -> 7 min continuously away
-- Safe WHERE: is_active = true AND ended_at IS NULL
-- ---------------------------------------------------------------------------

create index if not exists check_ins_auto_checkout_lookup_idx
  on public.check_ins (is_active, ended_at, started_at, away_started_at, last_distance_meters);

create or replace function public.run_auto_checkout_sweep(p_limit integer default 500)
returns table (
  check_in_id uuid,
  reason text,
  distance_m integer,
  away_started_at timestamptz,
  checked_out boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select
      c.id,
      c.last_distance_meters,
      c.away_started_at,
      case
        when c.started_at <= (now() - interval '4 hours') then 'inactivity'
        when c.away_started_at is null then null
        when c.last_distance_meters > 800
          and c.away_started_at <= (now() - interval '7 minutes') then 'left_geofence'
        when c.last_distance_meters > 400
          and c.last_distance_meters <= 800
          and c.away_started_at <= (now() - interval '15 minutes') then 'left_geofence'
        else null
      end as auto_reason
    from public.check_ins c
    where c.is_active = true
      and c.ended_at is null
    order by c.started_at asc
    limit greatest(1, coalesce(p_limit, 500))
  ),
  actionable as (
    select *
    from candidates
    where auto_reason is not null
  ),
  updated as (
    update public.check_ins c
    set
      is_active = false,
      ended_at = now(),
      auto_checkout_reason = a.auto_reason,
      end_reason = case
        when a.auto_reason = 'inactivity' then 'inactivity'
        else 'left_geofence'
      end
    from actionable a
    where c.id = a.id
      and c.is_active = true
      and c.ended_at is null
    returning c.id, a.auto_reason, a.last_distance_meters, a.away_started_at
  )
  select
    u.id as check_in_id,
    u.auto_reason as reason,
    u.last_distance_meters as distance_m,
    u.away_started_at,
    true as checked_out
  from updated u;
end;
$$;

revoke all on function public.run_auto_checkout_sweep(integer) from public;
grant execute on function public.run_auto_checkout_sweep(integer) to service_role;

-- Schedule every 5 min when pg_cron is available.
do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
    into existing_job_id
    from cron.job
    where jobname = 'gymly_auto_checkout_every_5m'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'gymly_auto_checkout_every_5m',
      '*/5 * * * *',
      $cron$select public.run_auto_checkout_sweep();$cron$
    );
  end if;
end $$;
