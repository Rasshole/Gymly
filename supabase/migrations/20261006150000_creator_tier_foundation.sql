-- Local QA foundation for coach and gym tiers.
-- An active referral is an existing referrals row with status = 'qualified'
-- whose referred account still passes referral_account_is_eligible.
-- That is the same eligibility gate and qualified status the invite flow
-- already uses. This migration does not add a new qualification rule.
-- Opens, downloads, attributed rows and invalidated rows do not count.

create table if not exists public.creator_tier_config (
  identity_type text primary key
    check (identity_type in ('coach', 'gym')),
  base_active_referrals integer not null
    check (base_active_referrals > 0),
  pro_active_referrals integer not null
    check (pro_active_referrals > base_active_referrals),
  earned_valid_days integer not null
    check (earned_valid_days > 0),
  grace_days integer not null
    check (grace_days >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Provisional local QA configuration, not a release decision:
-- Base 5 active referrals, Pro 15, earned window 30 days, grace 7 days.
insert into public.creator_tier_config (
  identity_type, base_active_referrals, pro_active_referrals, earned_valid_days, grace_days
) values
  ('coach', 5, 15, 30, 7),
  ('gym', 5, 15, 30, 7)
on conflict (identity_type) do nothing;

comment on table public.creator_tier_config is
  'Provisional local QA configuration. Seed values 5/15/30/7 are not a release decision.';

create table if not exists public.creator_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  identity_type text not null
    check (identity_type in ('coach', 'gym')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  effective_tier text not null default 'free'
    check (effective_tier in ('free', 'base', 'pro')),
  tier_reason text not null default 'free'
    check (tier_reason in ('free', 'paid', 'referrals')),
  tier_starts_at timestamptz,
  tier_expires_at timestamptz,
  grace_until timestamptz,
  active_referral_count integer not null default 0
    check (active_referral_count >= 0),
  paid_tier text
    check (paid_tier is null or paid_tier in ('base', 'pro')),
  paid_starts_at timestamptz,
  paid_expires_at timestamptz,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_source text
    check (review_source is null or review_source in ('service_role', 'database_owner')),
  review_note text,
  calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_tier_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  actor_id uuid,
  actor_role text not null,
  identity_type text,
  old_status text,
  new_status text,
  old_tier text,
  new_tier text,
  tier_reason text,
  created_at timestamptz not null default now()
);

create index if not exists creator_tier_audit_user_idx
  on public.creator_tier_audit (user_id, created_at desc);

alter table public.creator_tier_config enable row level security;
alter table public.creator_identities enable row level security;
alter table public.creator_tier_audit enable row level security;

revoke all on table public.creator_tier_config from public, anon, authenticated;
revoke all on table public.creator_identities from public, anon, authenticated;
revoke all on table public.creator_tier_audit from public, anon, authenticated;

create or replace function public.creator_tier_rank(p_tier text)
returns integer
language sql
immutable
as $f$
  select case p_tier
    when 'pro' then 2
    when 'base' then 1
    else 0
  end;
$f$;

create or replace function public.creator_tier_name(p_rank integer)
returns text
language sql
immutable
as $f$
  select case
    when p_rank >= 2 then 'pro'
    when p_rank = 1 then 'base'
    else 'free'
  end;
$f$;

-- Active referrals: qualified rows whose referred account is still eligible.
-- referral_account_is_eligible is the existing onboarding/demo gate.
-- status = 'qualified' is the existing activity gate (check-in >= 5 minutes
-- or logged workout sets). This function does not qualify anyone.
create or replace function public.count_active_referrals(p_referrer_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $f$
  select count(*)::integer
  from public.referrals r
  where r.referrer_id = p_referrer_id
    and r.status = 'qualified'
    and public.referral_account_is_eligible(r.referred_id);
$f$;

create or replace function public.creator_tier_actor_role()
returns text
language plpgsql
stable
as $f$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role = 'service_role' then
    return 'service_role';
  end if;
  if session_user in ('postgres', 'supabase_admin') and v_role not in ('anon', 'authenticated') then
    return 'database_owner';
  end if;
  return coalesce(nullif(v_role, ''), session_user);
end;
$f$;

create or replace function public.assert_creator_tier_server()
returns void
language plpgsql
stable
as $f$
begin
  if public.creator_tier_actor_role() not in ('service_role', 'database_owner') then
    raise exception 'CREATOR_TIER_FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$f$;

create or replace function public.recalculate_creator_tier(
  p_user_id uuid,
  p_as_of timestamptz default now()
)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_row public.creator_identities%rowtype;
  v_cfg public.creator_tier_config%rowtype;
  v_count integer := 0;
  v_as_of timestamptz := coalesce(p_as_of, now());
  v_referral_rank integer := 0;
  v_held_rank integer := 0;
  v_paid_rank integer := 0;
  v_effective_rank integer := 0;
  v_reason text := 'free';
  v_starts timestamptz;
  v_expires timestamptz;
  v_grace timestamptz;
  v_old_tier text;
  v_old_reason text;
begin
  if p_user_id is null then
    raise exception 'CREATOR_TIER_USER_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.creator_identities
  where user_id = p_user_id
  for update;

  if v_row.user_id is null or v_row.status is distinct from 'approved' then
    return json_build_object('ok', true, 'status', coalesce(v_row.status, 'none'));
  end if;

  select * into v_cfg
  from public.creator_tier_config
  where identity_type = v_row.identity_type;

  if v_cfg.identity_type is null then
    raise exception 'CREATOR_TIER_CONFIG_MISSING' using errcode = 'P0001';
  end if;

  v_count := public.count_active_referrals(p_user_id);
  v_old_tier := v_row.effective_tier;
  v_old_reason := v_row.tier_reason;

  if v_count >= v_cfg.pro_active_referrals then
    v_referral_rank := 2;
  elsif v_count >= v_cfg.base_active_referrals then
    v_referral_rank := 1;
  end if;

  if v_row.tier_reason = 'referrals' and public.creator_tier_rank(v_row.effective_tier) > 0 then
    if v_as_of < v_row.tier_expires_at then
      v_held_rank := public.creator_tier_rank(v_row.effective_tier);
    elsif v_row.grace_until is not null and v_as_of < v_row.grace_until then
      v_held_rank := public.creator_tier_rank(v_row.effective_tier);
    end if;
  end if;

  if v_row.paid_tier is not null and v_row.paid_starts_at is not null and v_row.paid_starts_at <= v_as_of then
    if v_row.paid_expires_at is null or v_as_of < v_row.paid_expires_at then
      v_paid_rank := public.creator_tier_rank(v_row.paid_tier);
    elsif v_as_of < v_row.paid_expires_at + make_interval(days => v_cfg.grace_days) then
      v_paid_rank := public.creator_tier_rank(v_row.paid_tier);
    end if;
  end if;

  if v_paid_rank >= greatest(v_referral_rank, v_held_rank) and v_paid_rank > 0 then
    v_effective_rank := v_paid_rank;
    v_reason := 'paid';
    v_starts := v_row.paid_starts_at;
    v_expires := v_row.paid_expires_at;
    v_grace := case
      when v_row.paid_expires_at is null then null
      else v_row.paid_expires_at + make_interval(days => v_cfg.grace_days)
    end;
  elsif greatest(v_referral_rank, v_held_rank) > 0 then
    v_effective_rank := greatest(v_referral_rank, v_held_rank);
    v_reason := 'referrals';
    if v_referral_rank >= v_held_rank then
      if v_row.tier_reason = 'referrals'
         and public.creator_tier_rank(v_row.effective_tier) = v_referral_rank
         and v_row.tier_expires_at is not null
         and v_as_of < v_row.tier_expires_at then
        v_starts := v_row.tier_starts_at;
        v_expires := v_row.tier_expires_at;
      else
        v_starts := v_as_of;
        v_expires := v_as_of + make_interval(days => v_cfg.earned_valid_days);
      end if;
      v_grace := v_expires + make_interval(days => v_cfg.grace_days);
    else
      v_starts := v_row.tier_starts_at;
      v_expires := v_row.tier_expires_at;
      v_grace := v_row.grace_until;
    end if;
  end if;

  update public.creator_identities
  set
    effective_tier = public.creator_tier_name(v_effective_rank),
    tier_reason = v_reason,
    tier_starts_at = v_starts,
    tier_expires_at = v_expires,
    grace_until = v_grace,
    active_referral_count = v_count,
    calculated_at = v_as_of,
    updated_at = now()
  where user_id = p_user_id
  returning * into v_row;

  if v_old_tier is distinct from v_row.effective_tier
     or v_old_reason is distinct from v_row.tier_reason then
    insert into public.creator_tier_audit (
      user_id, action, actor_id, actor_role, identity_type,
      old_status, new_status, old_tier, new_tier, tier_reason
    ) values (
      p_user_id, 'tier_recalculated', auth.uid(), public.creator_tier_actor_role(),
      v_row.identity_type, v_row.status, v_row.status,
      v_old_tier, v_row.effective_tier, v_row.tier_reason
    );
  end if;

  return json_build_object(
    'ok', true,
    'status', v_row.status,
    'identity_type', v_row.identity_type,
    'effective_tier', v_row.effective_tier,
    'tier_reason', v_row.tier_reason,
    'active_referrals', v_row.active_referral_count,
    'tier_starts_at', v_row.tier_starts_at,
    'tier_expires_at', v_row.tier_expires_at,
    'grace_until', v_row.grace_until
  );
end;
$f$;

create or replace function public.review_creator_identity(
  p_user_id uuid,
  p_identity_type text,
  p_status text,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_old public.creator_identities%rowtype;
  v_row public.creator_identities%rowtype;
  v_source text;
begin
  perform public.assert_creator_tier_server();

  if p_user_id is null then
    raise exception 'CREATOR_TIER_USER_REQUIRED' using errcode = 'P0001';
  end if;
  if p_identity_type not in ('coach', 'gym') then
    raise exception 'CREATOR_TIER_TYPE_INVALID' using errcode = 'P0001';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'CREATOR_TIER_STATUS_INVALID' using errcode = 'P0001';
  end if;

  v_source := public.creator_tier_actor_role();

  select * into v_old
  from public.creator_identities
  where user_id = p_user_id
  for update;

  if v_old.user_id is null then
    insert into public.creator_identities (
      user_id, identity_type, status, reviewed_at, reviewed_by, review_source, review_note
    ) values (
      p_user_id,
      p_identity_type,
      p_status,
      case when p_status = 'pending' then null else now() end,
      auth.uid(),
      v_source,
      nullif(trim(coalesce(p_note, '')), '')
    )
    returning * into v_row;
  else
    update public.creator_identities
    set
      identity_type = p_identity_type,
      status = p_status,
      reviewed_at = case when p_status = 'pending' then reviewed_at else now() end,
      reviewed_by = auth.uid(),
      review_source = v_source,
      review_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where user_id = p_user_id
    returning * into v_row;
  end if;

  insert into public.creator_tier_audit (
    user_id, action, actor_id, actor_role, identity_type,
    old_status, new_status, old_tier, new_tier, tier_reason
  ) values (
    p_user_id, 'identity_reviewed', auth.uid(), v_source, v_row.identity_type,
    v_old.status, v_row.status, v_old.effective_tier, v_row.effective_tier, v_row.tier_reason
  );

  if v_row.status = 'approved' then
    perform public.recalculate_creator_tier(p_user_id, now());
    select * into v_row from public.creator_identities where user_id = p_user_id;
  elsif v_row.status in ('pending', 'rejected') then
    update public.creator_identities
    set
      effective_tier = 'free',
      tier_reason = 'free',
      tier_starts_at = null,
      tier_expires_at = null,
      grace_until = null,
      updated_at = now()
    where user_id = p_user_id
    returning * into v_row;
  end if;

  return json_build_object(
    'ok', true,
    'status', v_row.status,
    'identity_type', v_row.identity_type,
    'effective_tier', v_row.effective_tier,
    'tier_reason', v_row.tier_reason,
    'reviewed_by', v_row.reviewed_by,
    'review_source', v_row.review_source
  );
end;
$f$;

-- Placeholder for a later payment provider. It records an entitlement only.
-- It does not charge anyone and does not create a subscription.
create or replace function public.set_creator_paid_entitlement(
  p_user_id uuid,
  p_tier text,
  p_starts_at timestamptz,
  p_expires_at timestamptz
)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_row public.creator_identities%rowtype;
begin
  perform public.assert_creator_tier_server();

  if p_tier is not null and p_tier not in ('base', 'pro') then
    raise exception 'CREATOR_TIER_PAID_INVALID' using errcode = 'P0001';
  end if;

  update public.creator_identities
  set
    paid_tier = p_tier,
    paid_starts_at = p_starts_at,
    paid_expires_at = p_expires_at,
    updated_at = now()
  where user_id = p_user_id
    and status = 'approved'
  returning * into v_row;

  if v_row.user_id is null then
    raise exception 'CREATOR_TIER_NOT_APPROVED' using errcode = 'P0001';
  end if;

  insert into public.creator_tier_audit (
    user_id, action, actor_id, actor_role, identity_type,
    old_status, new_status, old_tier, new_tier, tier_reason
  ) values (
    p_user_id, 'paid_entitlement_set', auth.uid(), public.creator_tier_actor_role(),
    v_row.identity_type, v_row.status, v_row.status, v_row.effective_tier, p_tier, 'paid'
  );

  return public.recalculate_creator_tier(p_user_id, coalesce(p_starts_at, now()));
end;
$f$;

create or replace function public.get_my_creator_tier_status()
returns json
language plpgsql
stable
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_row public.creator_identities%rowtype;
  v_cfg public.creator_tier_config%rowtype;
  v_next text;
  v_next_required integer;
begin
  if v_uid is null then
    raise exception 'CREATOR_TIER_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_row from public.creator_identities where user_id = v_uid;
  if v_row.user_id is not null then
    select * into v_cfg from public.creator_tier_config where identity_type = v_row.identity_type;
  end if;

  if v_row.user_id is null or v_row.effective_tier = 'pro' or v_cfg.identity_type is null then
    v_next := null;
    v_next_required := null;
  elsif public.creator_tier_rank(v_row.effective_tier) < 1 then
    v_next := 'base';
    v_next_required := v_cfg.base_active_referrals;
  else
    v_next := 'pro';
    v_next_required := v_cfg.pro_active_referrals;
  end if;

  return json_build_object(
    'identity_type', v_row.identity_type,
    'status', coalesce(v_row.status, 'none'),
    'effective_tier', coalesce(v_row.effective_tier, 'free'),
    'tier_reason', coalesce(v_row.tier_reason, 'free'),
    'active_referrals', coalesce(v_row.active_referral_count, 0),
    'base_required', v_cfg.base_active_referrals,
    'pro_required', v_cfg.pro_active_referrals,
    'next_tier', v_next,
    'next_tier_required', v_next_required,
    'tier_starts_at', v_row.tier_starts_at,
    'tier_expires_at', v_row.tier_expires_at,
    'grace_until', v_row.grace_until,
    'public_visible', coalesce(v_row.status = 'approved', false),
    'earned_valid_days', v_cfg.earned_valid_days,
    'grace_days', v_cfg.grace_days,
    'config_status', case
      when v_cfg.identity_type is null then null
      else 'provisional_qa'
    end
  );
end;
$f$;

create or replace view public.creator_public_identities
with (security_barrier = true) as
select user_id, identity_type, effective_tier
from public.creator_identities
where status = 'approved';

create or replace function public.creator_identities_block_client_write()
returns trigger
language plpgsql
as $f$
begin
  -- Statements inside security-definer server functions run as the owner.
  -- A client session whose current role is anon or authenticated cannot pass.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return coalesce(new, old);
  end if;
  raise exception 'CREATOR_TIER_WRITE_FORBIDDEN' using errcode = 'P0001';
end;
$f$;

drop trigger if exists creator_identities_block_client_write on public.creator_identities;
create trigger creator_identities_block_client_write
  before insert or update or delete on public.creator_identities
  for each row
  execute function public.creator_identities_block_client_write();

create or replace function public.creator_tier_on_referral_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_referrer uuid;
begin
  v_referrer := coalesce(new.referrer_id, old.referrer_id);
  if v_referrer is not null then
    begin
      perform public.recalculate_creator_tier(v_referrer, now());
    exception
      when others then
        raise warning 'creator tier recalc skipped for referrer %: %', v_referrer, sqlerrm;
    end;
  end if;
  return coalesce(new, old);
end;
$f$;

drop trigger if exists creator_tier_on_referral_change on public.referrals;
create trigger creator_tier_on_referral_change
  after insert or update of status or delete on public.referrals
  for each row
  execute function public.creator_tier_on_referral_change();

revoke all on function public.creator_tier_rank(text) from public, anon, authenticated;
revoke all on function public.creator_tier_name(integer) from public, anon, authenticated;
revoke all on function public.count_active_referrals(uuid) from public, anon, authenticated, service_role;
revoke all on function public.creator_tier_actor_role() from public, anon, authenticated, service_role;
revoke all on function public.assert_creator_tier_server() from public, anon, authenticated, service_role;
revoke all on function public.recalculate_creator_tier(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.review_creator_identity(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.set_creator_paid_entitlement(uuid, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.get_my_creator_tier_status() from public, anon, authenticated, service_role;
revoke all on function public.creator_identities_block_client_write() from public, anon, authenticated, service_role;
revoke all on function public.creator_tier_on_referral_change() from public, anon, authenticated, service_role;

grant execute on function public.recalculate_creator_tier(uuid, timestamptz) to postgres, service_role;
grant execute on function public.review_creator_identity(uuid, text, text, text) to postgres, service_role;
grant execute on function public.set_creator_paid_entitlement(uuid, text, timestamptz, timestamptz) to postgres, service_role;
grant execute on function public.get_my_creator_tier_status() to postgres, authenticated, service_role;
grant select on public.creator_public_identities to anon, authenticated, service_role;

comment on function public.count_active_referrals(uuid) is
  'Counts referrals already qualified by the existing check-in or workout rule, while the referred account remains eligible.';
comment on function public.set_creator_paid_entitlement(uuid, text, timestamptz, timestamptz) is
  'Payment placeholder. Records a tier entitlement for later billing. Does not charge or create a subscription.';
comment on view public.creator_public_identities is
  'Approved identity type and effective tier only. Pending and rejected identities are omitted.';
