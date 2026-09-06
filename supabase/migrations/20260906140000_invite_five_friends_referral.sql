-- Invite 5 Friends referral system (Founding Crew + shop entitlement).
-- Additive only. Server-authoritative attribution, qualification, and reward unlock.
--
-- Locked decisions:
-- * Account age for apply: auth.users.created_at, window <= 24 hours
-- * Optional invite code UI: onboarding social step (client in later checkpoint)
-- * Badge id referral_founder_5 is separate from social_squad_5
-- * referral_founder_5 writes require gymly.allow_referral_founder_badge=on
-- * Campaign id: invite_five_founding ; target: 5 qualified referrals
-- * Qualification (OR): first completed check-in lasting >= 5 minutes,
--   OR first completed check-in that has logged workout_sets
-- * Workout log always requires an active check_in (FK + RLS) and completes via
--   the same ended_at path — no separate workout qualify trigger is needed
-- * Source label: workout if workout_sets exist for that session, else check_in
-- * Trigger catches errors so checkout never rolls back due to referral logic
-- * No email-verification dependency (email confirm is disabled in Gymly)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint referral_codes_code_format check (code ~ '^[A-Z0-9]{4,16}$')
);

create unique index if not exists referral_codes_user_id_key
  on public.referral_codes (user_id);

create unique index if not exists referral_codes_code_key
  on public.referral_codes (code);

create index if not exists referral_codes_active_code_idx
  on public.referral_codes (code)
  where is_active;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referred_id uuid not null references auth.users (id) on delete cascade,
  referral_code_id uuid not null references public.referral_codes (id),
  status text not null default 'attributed'
    check (status in ('attributed', 'qualified', 'invalidated')),
  attributed_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualification_source text
    check (
      qualification_source is null
      or qualification_source in ('check_in', 'workout')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_no_self check (referrer_id <> referred_id)
);

create unique index if not exists referrals_referred_id_key
  on public.referrals (referred_id);

create index if not exists referrals_referrer_status_idx
  on public.referrals (referrer_id, status);

create index if not exists referrals_code_id_idx
  on public.referrals (referral_code_id);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id text not null,
  reward_type text not null,
  status text not null default 'unlocked'
    check (status in ('unlocked', 'redeemed', 'revoked')),
  unlocked_at timestamptz not null default now(),
  redeemed_at timestamptz,
  discount_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_rewards_user_campaign_key unique (user_id, campaign_id),
  constraint referral_rewards_campaign_id_len check (char_length(campaign_id) between 3 and 64)
);

create index if not exists referral_rewards_user_id_idx
  on public.referral_rewards (user_id);

-- ---------------------------------------------------------------------------
-- updated_at helpers
-- ---------------------------------------------------------------------------

create or replace function public.referral_touch_updated_at()
returns trigger
language plpgsql
as $f$
begin
  new.updated_at = now();
  return new;
end;
$f$;

drop trigger if exists set_referrals_updated_at on public.referrals;
create trigger set_referrals_updated_at
  before update on public.referrals
  for each row
  execute function public.referral_touch_updated_at();

drop trigger if exists set_referral_rewards_updated_at on public.referral_rewards;
create trigger set_referral_rewards_updated_at
  before update on public.referral_rewards
  for each row
  execute function public.referral_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Block client writes of referral_founder_5 on user_badges
-- ---------------------------------------------------------------------------

create or replace function public.user_badges_block_referral_founder_client_write()
returns trigger
language plpgsql
as $f$
begin
  if new.badge_id = 'referral_founder_5'
     and coalesce(current_setting('gymly.allow_referral_founder_badge', true), '')
         is distinct from 'on'
  then
    raise exception 'REFERRAL_FOUNDER_BADGE_SERVER_ONLY'
      using errcode = 'P0001';
  end if;
  return new;
end;
$f$;

drop trigger if exists trg_user_badges_block_referral_founder on public.user_badges;
do $t$
begin
  if to_regclass('public.user_badges') is not null then
    execute $sql$
      create trigger trg_user_badges_block_referral_founder
        before insert or update of badge_id, unlocked_at, progress
        on public.user_badges
        for each row
        execute function public.user_badges_block_referral_founder_client_write()
    $sql$;
  end if;
end
$t$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.referral_normalize_code(p_code text)
returns text
language sql
immutable
as $f$
  select nullif(
    upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g')),
    ''
  );
$f$;

create or replace function public.referral_invite_url(p_code text)
returns text
language sql
immutable
as $f$
  select 'https://gymlyapp.com/invite/' || public.referral_normalize_code(p_code);
$f$;

create or replace function public.referral_account_is_eligible(p_user_id uuid)
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
    return false;
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = p_user_id;

  -- Profile with username = required onboarding/profile setup completed.
  if v_username is null or length(trim(v_username)) = 0 then
    return false;
  end if;

  if lower(v_username) like 'demo[_]%'
     or lower(v_username) like 'test[_]%seed%' then
    return false;
  end if;

  -- Fix: remove accidental space in demo pattern above in post-process
  select u.email, u.raw_user_meta_data ->> 'gymly_demo'
  into v_email, v_demo_meta
  from auth.users u
  where u.id = p_user_id;

  if coalesce(v_demo_meta, '') in ('true', '1', 'yes') then
    return false;
  end if;

  if v_email is not null and (
    lower(v_email) like '%+demo@%'
    or lower(v_email) like '%@gymly.demo'
    or lower(v_email) like '%@example.com'
  ) then
    return false;
  end if;

  return true;
end;
$f$;

create or replace function public.referral_generate_unique_code(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_base text;
  v_code text;
  v_suffix text;
  i integer;
begin
  select upper(regexp_replace(coalesce(p.username, ''), '[^a-zA-Z0-9]', '', 'g'))
  into v_base
  from public.profiles p
  where p.id = p_user_id;

  if v_base is null or length(v_base) < 3 then
    v_base := 'GYMLY';
  end if;

  v_base := left(v_base, 8);

  for i in 1..24 loop
    v_suffix := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    v_code := left(v_base || v_suffix, 16);
    if not exists (select 1 from public.referral_codes c where c.code = v_code) then
      return v_code;
    end if;
  end loop;

  raise exception 'REFERRAL_CODE_GENERATION_FAILED' using errcode = 'P0001';
end;
$f$;

create or replace function public.try_unlock_invite_five_reward(p_referrer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_qualified integer;
begin
  if p_referrer_id is null then
    return false;
  end if;

  select count(*)::integer into v_qualified
  from public.referrals r
  where r.referrer_id = p_referrer_id
    and r.status = 'qualified';

  if v_qualified < 5 then
    return false;
  end if;

  insert into public.referral_rewards (
    user_id,
    campaign_id,
    reward_type,
    status,
    metadata
  )
  values (
    p_referrer_id,
    'invite_five_founding',
    'founding_crew_badge_and_shop_entitlement',
    'unlocked',
    jsonb_build_object(
      'badge_id', 'referral_founder_5',
      'qualified_required', 5,
      'shop_discount_percent', 15
    )
  )
  on conflict on constraint referral_rewards_user_campaign_key do nothing;

  -- Award Founding Crew once (server-only gate). Separate from social_squad_5.
  perform set_config('gymly.allow_referral_founder_badge', 'on', true);

  insert into public.user_badges (user_id, badge_id, progress, unlocked_at)
  values (p_referrer_id, 'referral_founder_5', 5, now())
  on conflict (user_id, badge_id) do update
    set
      progress = greatest(public.user_badges.progress, excluded.progress),
      unlocked_at = coalesce(public.user_badges.unlocked_at, excluded.unlocked_at),
      updated_at = now()
  where public.user_badges.unlocked_at is null;

  return true;
end;
$f$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_my_referral_code()
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_row public.referral_codes%rowtype;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.referral_account_is_eligible(v_uid) then
    raise exception 'REFERRAL_ACCOUNT_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.referral_codes c
  where c.user_id = v_uid
  limit 1;

  if v_row.id is null then
    v_code := public.referral_generate_unique_code(v_uid);
    insert into public.referral_codes (user_id, code, is_active)
    values (v_uid, v_code, true)
    returning * into v_row;
  end if;

  return json_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'is_active', v_row.is_active,
    'url', public.referral_invite_url(v_row.code),
    'created_at', v_row.created_at
  );
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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_norm := public.referral_normalize_code(p_code);
  if v_norm is null or length(v_norm) < 4 then
    raise exception 'REFERRAL_CODE_INVALID' using errcode = 'P0001';
  end if;

  if not public.referral_account_is_eligible(v_uid) then
    raise exception 'REFERRAL_ACCOUNT_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select u.created_at into v_created_at
  from auth.users u
  where u.id = v_uid;

  if v_created_at is null then
    raise exception 'REFERRAL_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- New-account window: Language -> Register -> profile -> gym -> social -> Main.
  if v_created_at < (now() - interval '24 hours') then
    raise exception 'REFERRAL_APPLY_WINDOW_EXPIRED' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.referrals r
  where r.referred_id = v_uid
  limit 1;

  if v_existing.id is not null then
    raise exception 'REFERRAL_ALREADY_ATTRIBUTED' using errcode = 'P0001';
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

  insert into public.referrals (
    referrer_id,
    referred_id,
    referral_code_id,
    status,
    attributed_at
  )
  values (
    v_code.user_id,
    v_uid,
    v_code.id,
    'attributed',
    now()
  )
  returning * into v_row;

  return json_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'attributed_at', v_row.attributed_at,
    'referrer_id', v_row.referrer_id
  );
exception
  when unique_violation then
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
    count(*) filter (where r.status in ('attributed', 'qualified'))::integer,
    count(*) filter (where r.status = 'qualified')::integer
  into v_attributed, v_qualified
  from public.referrals r
  where r.referrer_id = v_uid;

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
    'attributed_count', coalesce(v_attributed, 0),
    'qualified_count', coalesce(v_qualified, 0),
    'reward_unlocked', v_reward.id is not null,
    'reward_status', v_reward.status,
    'discount_code', v_reward.discount_code,
    'shop_discount_percent', 15
  );
end;
$f$;

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
  v_bypass text := coalesce(current_setting('gymly.referral_qualify_bypass', true), '');
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

  if v_bypass is distinct from 'on' then
    if v_uid is null or v_uid is distinct from p_referred_id then
      raise exception 'REFERRAL_QUALIFY_FORBIDDEN' using errcode = 'P0001';
    end if;
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

  if not public.referral_account_is_eligible(p_referred_id) then
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

-- ---------------------------------------------------------------------------
-- Qualification trigger on first check-in completion
-- ---------------------------------------------------------------------------

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
      perform set_config('gymly.referral_qualify_bypass', 'on', true);
      perform public.qualify_referral_for_user(new.user_id, 'check_in');
    exception
      when others then
        raise warning 'referral qualify skipped for check_in %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$f$;

drop trigger if exists trg_referral_on_check_in_completed on public.check_ins;
create trigger trg_referral_on_check_in_completed
  after update of ended_at on public.check_ins
  for each row
  execute function public.referral_on_check_in_completed();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;

drop policy if exists "referral_codes_select_own" on public.referral_codes;
create policy "referral_codes_select_own"
  on public.referral_codes for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "referrals_select_as_referrer" on public.referrals;
create policy "referrals_select_as_referrer"
  on public.referrals for select
  to authenticated
  using (referrer_id = (select auth.uid()));

drop policy if exists "referrals_select_as_referred" on public.referrals;
create policy "referrals_select_as_referred"
  on public.referrals for select
  to authenticated
  using (referred_id = (select auth.uid()));

drop policy if exists "referral_rewards_select_own" on public.referral_rewards;
create policy "referral_rewards_select_own"
  on public.referral_rewards for select
  to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policies for authenticated on these tables.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.referral_normalize_code(text) from public;
grant execute on function public.referral_normalize_code(text) to authenticated;

revoke all on function public.referral_invite_url(text) from public;
grant execute on function public.referral_invite_url(text) to authenticated;

revoke all on function public.get_or_create_my_referral_code() from public;
grant execute on function public.get_or_create_my_referral_code() to authenticated;

revoke all on function public.apply_referral_code(text) from public;
grant execute on function public.apply_referral_code(text) to authenticated;

revoke all on function public.get_my_referral_progress() from public;
grant execute on function public.get_my_referral_progress() to authenticated;

revoke all on function public.qualify_referral_for_user(uuid, text) from public;
grant execute on function public.qualify_referral_for_user(uuid, text) to authenticated;

revoke all on function public.referral_account_is_eligible(uuid) from public;
revoke all on function public.referral_generate_unique_code(uuid) from public;
revoke all on function public.try_unlock_invite_five_reward(uuid) from public;

comment on table public.referral_codes is
  'One personal invite code per user (Invite 5 Friends).';
comment on table public.referrals is
  'Attributed/qualified referral edges; referred_id unique; status server-owned.';
comment on table public.referral_rewards is
  'Campaign rewards (invite_five_founding). discount_code optional until a real shop code exists.';
comment on function public.apply_referral_code(text) is
  'Attribute referrer during onboarding within 24h of auth.users.created_at. Permanent.';
comment on function public.qualify_referral_for_user(uuid, text) is
  'Idempotent qualify after first valid completed check-in; unlocks reward at 5.';
comment on function public.try_unlock_invite_five_reward(uuid) is
  'Atomic unlock of invite_five_founding + server-only referral_founder_5 badge.';
