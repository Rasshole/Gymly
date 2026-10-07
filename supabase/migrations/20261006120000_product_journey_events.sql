-- First-party funnel steps for signup, onboarding, first activity and later activity.
-- Rows store a user id, step, date and source. Credentials and profile text are not columns.
-- Once-only steps and same-day returns are deduped. A retry or restart does not add a row.

create table if not exists public.product_journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  step text not null,
  activity_date date not null,
  occurred_at timestamptz not null,
  source text not null,
  dedupe_key text not null,
  constraint product_journey_events_step_check check (
    step in (
      'signup',
      'onboarding_completed',
      'first_activity',
      'returning_activity'
    )
  ),
  constraint product_journey_events_source_check check (
    source in ('auth', 'onboarding', 'check_in')
  ),
  constraint product_journey_events_dedupe_key unique (dedupe_key)
);

create index if not exists product_journey_events_user_step_idx
  on public.product_journey_events (user_id, step);

alter table public.product_journey_events enable row level security;

drop policy if exists "product_journey_events_select_own" on public.product_journey_events;
create policy "product_journey_events_select_own"
  on public.product_journey_events for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.product_journey_events from public, anon, authenticated, service_role;
grant select on table public.product_journey_events to authenticated;
grant select, insert on table public.product_journey_events to postgres, service_role;

create or replace function public.product_journey_dedupe_key(
  p_user_id uuid,
  p_step text,
  p_activity_date date
)
returns text
language sql
immutable
as $$
  select case
    when p_step = 'returning_activity' then p_user_id::text || ':returning_activity:' || p_activity_date::text
    else p_user_id::text || ':' || p_step
  end;
$$;

create or replace function public.record_product_journey_for_user(
  p_user_id uuid,
  p_step text,
  p_activity_date date,
  p_occurred_at timestamptz,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_activity_date is null or p_occurred_at is null then
    return;
  end if;
  insert into public.product_journey_events (
    user_id,
    step,
    activity_date,
    occurred_at,
    source,
    dedupe_key
  )
  values (
    p_user_id,
    p_step,
    p_activity_date,
    p_occurred_at,
    p_source,
    public.product_journey_dedupe_key(p_user_id, p_step, p_activity_date)
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.product_journey_dedupe_key(uuid, text, date) from public, anon, authenticated, service_role;
revoke all on function public.record_product_journey_for_user(uuid, text, date, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.product_journey_dedupe_key(uuid, text, date) to postgres, service_role;
grant execute on function public.record_product_journey_for_user(uuid, text, date, timestamptz, text) to postgres, service_role;

create or replace function public.record_my_account_journey(p_just_completed boolean default false)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  created timestamptz;
  onboarding_at timestamptz;
  flag_on boolean := false;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select u.created_at,
         coalesce(u.raw_user_meta_data->>'gymlyOnboardingComplete', '') in ('true', 't')
    into created, flag_on
  from auth.users u
  where u.id = me;

  if created is null then
    return;
  end if;

  perform public.record_product_journey_for_user(
    me,
    'signup',
    (timezone('Europe/Copenhagen', created))::date,
    created,
    'auth'
  );

  if flag_on or p_just_completed then
    onboarding_at := case when p_just_completed then now() else created end;
    perform public.record_product_journey_for_user(
      me,
      'onboarding_completed',
      (timezone('Europe/Copenhagen', onboarding_at))::date,
      onboarding_at,
      'onboarding'
    );
  end if;
end;
$$;

create or replace function public.record_check_in_journey(
  p_user_id uuid,
  p_check_in_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ended timestamptz;
  ended_day date;
  first_ended timestamptz;
  first_day date;
begin
  if p_user_id is null or p_check_in_id is null then
    return;
  end if;

  select c.ended_at
    into ended
  from public.check_ins c
  where c.id = p_check_in_id
    and c.user_id = p_user_id
    and c.ended_at is not null;

  if ended is null then
    return;
  end if;

  select c.ended_at
    into first_ended
  from public.check_ins c
  where c.user_id = p_user_id
    and c.ended_at is not null
  order by c.ended_at asc
  limit 1;

  first_day := (timezone('Europe/Copenhagen', first_ended))::date;
  ended_day := (timezone('Europe/Copenhagen', ended))::date;

  perform public.record_product_journey_for_user(
    p_user_id,
    'first_activity',
    first_day,
    first_ended,
    'check_in'
  );

  if ended_day > first_day then
    perform public.record_product_journey_for_user(
      p_user_id,
      'returning_activity',
      ended_day,
      ended,
      'check_in'
    );
  end if;
end;
$$;

create or replace function public.record_my_completed_check_in(p_check_in_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  perform public.record_check_in_journey(me, p_check_in_id);
end;
$$;

revoke all on function public.record_check_in_journey(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_check_in_journey(uuid, uuid) to postgres, service_role;

revoke all on function public.record_my_account_journey(boolean) from public, anon, authenticated, service_role;
revoke all on function public.record_my_completed_check_in(uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_my_account_journey(boolean) to postgres, authenticated, service_role;
grant execute on function public.record_my_completed_check_in(uuid) to postgres, authenticated, service_role;

create or replace function public.product_journey_on_check_in_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.ended_at is null
     and new.ended_at is not null
     and new.user_id is not null
  then
    begin
      perform public.record_check_in_journey(new.user_id, new.id);
    exception
      when others then
        raise warning 'product journey skipped for check_in %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.product_journey_on_check_in_completed() from public, anon, authenticated, service_role;
grant execute on function public.product_journey_on_check_in_completed() to postgres;

drop trigger if exists trg_product_journey_on_check_in_completed on public.check_ins;
create trigger trg_product_journey_on_check_in_completed
  after update of ended_at on public.check_ins
  for each row
  execute function public.product_journey_on_check_in_completed();

-- D1/D7 are observable only after those calendar days. Null means the day has not arrived.
create or replace function public.retention_window_status(
  p_first date,
  p_activity_dates date[],
  p_today date
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'd1_due', p_today >= (p_first + 1),
    'd7_due', p_today >= (p_first + 7),
    'd1_returned',
      case
        when p_today >= (p_first + 1) then (p_first + 1) = any (coalesce(p_activity_dates, '{}'::date[]))
        else null
      end,
    'd7_returned',
      case
        when p_today >= (p_first + 7) then (p_first + 7) = any (coalesce(p_activity_dates, '{}'::date[]))
        else null
      end
  );
$$;

create or replace function public.my_activity_retention_basis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  first_day date;
  check_in_dates date[];
  returning_dates date[];
  today date := (timezone('Europe/Copenhagen', now()))::date;
  window_status jsonb;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select e.activity_date
    into first_day
  from public.product_journey_events e
  where e.user_id = me
    and e.step = 'first_activity';

  select coalesce(array_agg(d order by d), '{}'::date[])
    into check_in_dates
  from (
    select distinct (timezone('Europe/Copenhagen', c.ended_at))::date as d
    from public.check_ins c
    where c.user_id = me
      and c.ended_at is not null
  ) days;

  select coalesce(array_agg(e.activity_date order by e.activity_date), '{}'::date[])
    into returning_dates
  from public.product_journey_events e
  where e.user_id = me
    and e.step = 'returning_activity';

  window_status := case
    when first_day is null then null
    else public.retention_window_status(first_day, check_in_dates, today)
  end;

  return jsonb_build_object(
    'signup_date', (
      select e.activity_date
      from public.product_journey_events e
      where e.user_id = me and e.step = 'signup'
    ),
    'onboarding_date', (
      select e.activity_date
      from public.product_journey_events e
      where e.user_id = me and e.step = 'onboarding_completed'
    ),
    'first_activity_date', first_day,
    'check_in_dates', to_jsonb(check_in_dates),
    'returning_event_dates', to_jsonb(returning_dates),
    'retention', window_status
  );
end;
$$;

revoke all on function public.retention_window_status(date, date[], date) from public, anon, authenticated, service_role;
revoke all on function public.my_activity_retention_basis() from public, anon, authenticated, service_role;
grant execute on function public.retention_window_status(date, date[], date) to postgres, authenticated, service_role;
grant execute on function public.my_activity_retention_basis() to postgres, authenticated, service_role;
