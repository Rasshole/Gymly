-- Local-and-repo follow-up for Invite 5 Friends.
-- Reuses referral_codes, referrals, and referral_rewards.
-- Does not change the 24-hour window, one-referrer rule, self-referral block,
-- or the qualifying-activity rule (check-in >= 5 minutes OR workout sets).
-- Opens and downloads are not qualified referrals.

alter table public.referrals
  add column if not exists invite_captured_at timestamptz,
  add column if not exists account_created_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.referral_codes
  add column if not exists invite_open_count integer not null default 0;

-- Demo/test accounts stay ineligible. A missing username is unfinished
-- onboarding, not a disqualified account.
create or replace function public.referral_account_is_disqualified(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $f$
declare
  v_username text;
  v_email text;
  v_demo_meta text;
begin
  if p_user_id is null then
    return true;
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return true;
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = p_user_id;

  if lower(coalesce(v_username, '')) like 'demo[_]%'
     or lower(coalesce(v_username, '')) like 'test[_]%seed%' then
    return true;
  end if;

  select u.email, u.raw_user_meta_data ->> 'gymly_demo'
  into v_email, v_demo_meta
  from auth.users u
  where u.id = p_user_id;

  if coalesce(v_demo_meta, '') in ('true', '1', 'yes') then
    return true;
  end if;

  if v_email is not null and (
    lower(v_email) like '%+demo@%'
    or lower(v_email) like '%@gymly.demo'
    or lower(v_email) like '%@example.com'
  ) then
    return true;
  end if;

  return false;
end;
$f$;

create or replace function public.record_referral_invite_open(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_norm text;
  v_id uuid;
begin
  v_norm := public.referral_normalize_code(p_code);
  if v_norm is null or length(v_norm) < 4 then
    return json_build_object('ok', false, 'status', 'invalid');
  end if;

  update public.referral_codes c
  set invite_open_count = c.invite_open_count + 1
  where c.code = v_norm
    and c.is_active
  returning c.id into v_id;

  if v_id is null then
    return json_build_object('ok', false, 'status', 'not_found');
  end if;

  -- Invitation only. Never creates a referral and never qualifies one.
  return json_build_object('ok', true, 'status', 'recorded');
end;
$f$;

create or replace function public.apply_referral_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_norm text;
  v_code public.referral_codes%rowtype;
  v_existing public.referrals%rowtype;
  v_created_at timestamptz;
  v_row public.referrals%rowtype;
  v_onboarding timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_norm := public.referral_normalize_code(p_code);
  if v_norm is null or length(v_norm) < 4 then
    raise exception 'REFERRAL_CODE_INVALID' using errcode = 'P0001';
  end if;

  if public.referral_account_is_disqualified(v_uid) then
    raise exception 'REFERRAL_ACCOUNT_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select u.created_at into v_created_at
  from auth.users u
  where u.id = v_uid;

  if v_created_at is null then
    raise exception 'REFERRAL_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_code
  from public.referral_codes c
  where c.code = v_norm
    and c.is_active
  limit 1;

  if v_code.id is null then
    raise exception 'REFERRAL_CODE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_code.user_id = v_uid then
    raise exception 'REFERRAL_SELF_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if not public.referral_account_is_eligible(v_code.user_id) then
    raise exception 'REFERRAL_REFERRER_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.referrals r
  where r.referred_id = v_uid
  limit 1;

  if v_existing.id is not null then
    if v_existing.referral_code_id is distinct from v_code.id then
      raise exception 'REFERRAL_ALREADY_ATTRIBUTED' using errcode = 'P0001';
    end if;

    if public.referral_account_is_eligible(v_uid)
       and v_existing.onboarding_completed_at is null then
      update public.referrals r
      set onboarding_completed_at = now(), updated_at = now()
      where r.id = v_existing.id
      returning * into v_existing;
    end if;

    return json_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'attributed_at', v_existing.attributed_at,
      'referrer_id', v_existing.referrer_id,
      'invite_captured_at', v_existing.invite_captured_at,
      'account_created_at', v_existing.account_created_at,
      'onboarding_completed_at', v_existing.onboarding_completed_at,
      'qualified_at', v_existing.qualified_at,
      'idempotent', true
    );
  end if;

  -- New-account window: Language -> Register -> profile -> gym -> social -> Main.
  if v_created_at < (now() - interval '24 hours') then
    raise exception 'REFERRAL_APPLY_WINDOW_EXPIRED' using errcode = 'P0001';
  end if;

  v_onboarding := case
    when public.referral_account_is_eligible(v_uid) then now()
    else null
  end;

  insert into public.referrals (
    referrer_id,
    referred_id,
    referral_code_id,
    status,
    attributed_at,
    invite_captured_at,
    account_created_at,
    onboarding_completed_at
  )
  values (
    v_code.user_id,
    v_uid,
    v_code.id,
    'attributed',
    now(),
    now(),
    v_created_at,
    v_onboarding
  )
  returning * into v_row;

  return json_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'attributed_at', v_row.attributed_at,
    'referrer_id', v_row.referrer_id,
    'invite_captured_at', v_row.invite_captured_at,
    'account_created_at', v_row.account_created_at,
    'onboarding_completed_at', v_row.onboarding_completed_at,
    'qualified_at', v_row.qualified_at,
    'idempotent', false
  );
exception
  when unique_violation then
    select * into v_existing
    from public.referrals r
    where r.referred_id = v_uid
    limit 1;

    if v_existing.id is not null and v_existing.referral_code_id = v_code.id then
      return json_build_object(
        'id', v_existing.id,
        'status', v_existing.status,
        'attributed_at', v_existing.attributed_at,
        'referrer_id', v_existing.referrer_id,
        'invite_captured_at', v_existing.invite_captured_at,
        'account_created_at', v_existing.account_created_at,
        'onboarding_completed_at', v_existing.onboarding_completed_at,
        'qualified_at', v_existing.qualified_at,
        'idempotent', true
      );
    end if;

    raise exception 'REFERRAL_ALREADY_ATTRIBUTED' using errcode = 'P0001';
end;
$f$;

create or replace function public.get_my_referral_progress()
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_code public.referral_codes%rowtype;
  v_attributed integer := 0;
  v_qualified integer := 0;
  v_signed_up integer := 0;
  v_onboarded integer := 0;
  v_invited integer := 0;
  v_reward public.referral_rewards%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.get_or_create_my_referral_code();

  select * into v_code
  from public.referral_codes c
  where c.user_id = v_uid
  limit 1;

  select
    count(*)::integer,
    count(*) filter (where r.status in ('attributed', 'qualified'))::integer,
    count(*) filter (
      where r.onboarding_completed_at is not null
        or (
          r.account_created_at is null
          and r.status in ('attributed', 'qualified')
        )
    )::integer,
    count(*) filter (where r.status = 'qualified')::integer
  into v_signed_up, v_attributed, v_onboarded, v_qualified
  from public.referrals r
  where r.referrer_id = v_uid;

  -- Accounts that applied the code. invite_open_count stays telemetry and is not this number.
  v_invited := coalesce(v_signed_up, 0);

  select * into v_reward
  from public.referral_rewards rw
  where rw.user_id = v_uid
    and rw.campaign_id = 'invite_five_founding'
  limit 1;

  return json_build_object(
    'code', v_code.code,
    'url', public.referral_invite_url(v_code.code),
    'campaign_id', 'invite_five_founding',
    'badge_id', 'referral_founder_5',
    'target', 5,
    'invited_count', coalesce(v_signed_up, 0),
    'invite_open_count', coalesce(v_code.invite_open_count, 0),
    'signed_up_count', coalesce(v_signed_up, 0),
    'onboarded_count', coalesce(v_onboarded, 0),
    'attributed_count', coalesce(v_attributed, 0),
    'qualified_count', coalesce(v_qualified, 0),
    'reward_unlocked', v_reward.id is not null,
    'reward_status', v_reward.status,
    'discount_code', v_reward.discount_code,
    'shop_discount_percent', 15
  );
end;
$f$;

-- Server qualification. Not granted to anon or authenticated.
-- The check-in trigger calls this directly. It does not read a session GUC.
create or replace function public.referral_qualify_recorded(
  p_referred_id uuid,
  p_source text default 'check_in'
)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_source text := coalesce(nullif(trim(p_source), ''), 'check_in');
  v_row public.referrals%rowtype;
  v_duration integer;
  v_has_sets boolean := false;
  v_check_in_id uuid;
  v_unlocked boolean := false;
begin
  if p_referred_id is null then
    raise exception 'REFERRAL_REFERRED_REQUIRED' using errcode = 'P0001';
  end if;

  if v_source not in ('check_in', 'workout') then
    raise exception 'REFERRAL_SOURCE_INVALID' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.referrals r
  where r.referred_id = p_referred_id
  for update;

  if v_row.id is null then
    return json_build_object('ok', true, 'status', 'no_referral');
  end if;

  if v_row.status = 'qualified' then
    return json_build_object(
      'ok', true,
      'status', 'already_qualified',
      'qualified_at', v_row.qualified_at,
      'qualification_source', v_row.qualification_source
    );
  end if;

  if v_row.status = 'invalidated' then
    return json_build_object('ok', true, 'status', 'invalidated');
  end if;

  -- Unfinished profile is not an active referral and must not be invalidated.
  if not public.referral_account_is_eligible(p_referred_id) then
    if not public.referral_account_is_disqualified(p_referred_id) then
      return json_build_object('ok', true, 'status', 'not_ready');
    end if;
    update public.referrals
    set status = 'invalidated', updated_at = now()
    where id = v_row.id;
    return json_build_object('ok', true, 'status', 'invalidated');
  end if;

  -- First completed check-in for this user (workout log is always tied to check_ins.id).
  select
    c.id,
    coalesce(
      c.duration_minutes,
      greatest(
        1,
        round(extract(epoch from (c.ended_at - c.started_at)) / 60.0)::integer
      )
    )
  into v_check_in_id, v_duration
  from public.check_ins c
  where c.user_id = p_referred_id
    and c.ended_at is not null
    and c.started_at is not null
  order by c.ended_at asc
  limit 1;

  if v_check_in_id is null then
    return json_build_object('ok', true, 'status', 'not_ready');
  end if;

  if to_regclass('public.workout_sets') is not null then
    execute
      'select exists (
         select 1 from public.workout_sets ws
         where ws.session_id = $1 and ws.user_id = $2
         limit 1
       )'
    into v_has_sets
    using v_check_in_id, p_referred_id;
  end if;

  -- Product OR: qualifying check-in (>= 5 min) OR genuinely logged workout sets.
  if coalesce(v_duration, 0) < 5 and not v_has_sets then
    return json_build_object('ok', true, 'status', 'not_ready');
  end if;

  if v_has_sets then
    v_source := 'workout';
  else
    v_source := 'check_in';
  end if;

  update public.referrals r
  set
    status = 'qualified',
    qualified_at = now(),
    qualification_source = v_source,
    updated_at = now()
  where r.id = v_row.id
    and r.status = 'attributed'
  returning * into v_row;

  if v_row.id is null or v_row.status is distinct from 'qualified' then
    select * into v_row from public.referrals where referred_id = p_referred_id;
    return json_build_object(
      'ok', true,
      'status', coalesce(v_row.status, 'unknown'),
      'qualified_at', v_row.qualified_at,
      'qualification_source', v_row.qualification_source
    );
  end if;

  v_unlocked := public.try_unlock_invite_five_reward(v_row.referrer_id);

  return json_build_object(
    'ok', true,
    'status', 'qualified',
    'qualified_at', v_row.qualified_at,
    'qualification_source', v_row.qualification_source,
    'reward_unlocked', v_unlocked
  );
end;
$f$;

-- No client execute. An authenticated session can rewrite request.jwt claims,
-- so a self-check on auth.uid() does not hold. The check-in trigger calls
-- referral_qualify_recorded directly.
create or replace function public.qualify_referral_for_user(
  p_referred_id uuid,
  p_source text default 'check_in'
)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
begin
  if coalesce(auth.role(), '') is distinct from 'authenticated'
     or v_uid is null
     or v_uid is distinct from p_referred_id then
    raise exception 'REFERRAL_QUALIFY_FORBIDDEN' using errcode = 'P0001';
  end if;
  return public.referral_qualify_recorded(p_referred_id, p_source);
end;
$f$;

create or replace function public.referral_on_check_in_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
begin
  if tg_op = 'UPDATE'
     and old.ended_at is null
     and new.ended_at is not null
     and new.user_id is not null
  then
    begin
      perform public.referral_qualify_recorded(new.user_id, 'check_in');
    exception
      when others then
        raise warning 'referral qualify skipped for check_in %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$f$;

revoke all on function public.referral_account_is_disqualified(uuid) from public, anon, authenticated, service_role;
grant execute on function public.referral_account_is_disqualified(uuid) to postgres;
revoke all on function public.referral_qualify_recorded(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.referral_qualify_recorded(uuid, text) to postgres;
revoke all on function public.referral_on_check_in_completed() from public, anon, authenticated, service_role;
grant execute on function public.referral_on_check_in_completed() to postgres;
revoke all on function public.qualify_referral_for_user(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.qualify_referral_for_user(uuid, text) to postgres;
revoke all on function public.apply_referral_code(text) from public, anon, authenticated, service_role;
grant execute on function public.apply_referral_code(text) to postgres, authenticated, service_role;
revoke all on function public.get_my_referral_progress() from public, anon, authenticated, service_role;
grant execute on function public.get_my_referral_progress() to postgres, authenticated, service_role;
revoke all on function public.record_referral_invite_open(text) from public, anon, authenticated, service_role;
grant execute on function public.record_referral_invite_open(text) to postgres, anon, authenticated, service_role;

comment on function public.apply_referral_code(text) is
  'Attributes the authenticated user to one referrer. Same-code retries are idempotent. Window is 24 hours from auth.users.created_at.';
comment on function public.record_referral_invite_open(text) is
  'Counts an invite-link open. Does not create or qualify a referral. The count is telemetry and is not the account total.';
comment on function public.qualify_referral_for_user(uuid, text) is
  'Not granted to client roles. Active qualification is referral_qualify_recorded, called by the check-in trigger.';
