-- Isolated creator-tier checks. The outer transaction is rolled back.
begin;

update public.creator_tier_config
set base_active_referrals = 2,
    pro_active_referrals = 4,
    earned_valid_days = 10,
    grace_days = 3,
    updated_at = now();

do $t$
declare
  v_coach uuid := gen_random_uuid();
  v_paid uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_friends uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_placeholder uuid := gen_random_uuid();
  v_code uuid;
  v_tier text;
  v_reason text;
  v_count integer;
  v_starts timestamptz;
  v_starts_again timestamptz;
  v_public integer;
  v_t0 timestamptz := '2026-01-01 00:00:00+00';
  i integer;
begin
  insert into auth.users (id, email) values
    (v_coach, 'ct-coach-' || v_coach || '@gymly.local'),
    (v_paid, 'ct-paid-' || v_paid || '@gymly.local'),
    (v_pending, 'ct-pending-' || v_pending || '@gymly.local'),
    (v_placeholder, 'ct-placeholder-' || v_placeholder || '@gymly.local');

  insert into public.profiles (id, username, display_name) values
    (v_coach, 'ctcoach' || substr(v_coach::text, 1, 8), 'Coach'),
    (v_paid, 'ctpaid' || substr(v_paid::text, 1, 8), 'Paid'),
    (v_pending, 'ctpend' || substr(v_pending::text, 1, 8), 'Pending'),
    (v_placeholder, 'cthold' || substr(v_placeholder::text, 1, 8), 'Placeholder');
  update public.profiles
  set username_requires_change = true
  where id = v_placeholder;

  for i in 1..5 loop
    insert into auth.users (id, email)
    values (v_friends[i], 'ct-friend-' || i || '-' || v_friends[i] || '@gymly.local');
    insert into public.profiles (id, username, display_name)
    values (v_friends[i], 'ctfriend' || i || substr(v_friends[i]::text, 1, 6), 'Friend ' || i);
  end loop;

  insert into public.referral_codes (user_id, code)
  values (v_coach, 'CT' || upper(substr(replace(v_coach::text, '-', ''), 1, 8)))
  returning id into v_code;

  perform public.review_creator_identity(v_pending, 'coach', 'pending', 'awaiting review');
  select count(*) into v_public
  from public.creator_public_identities
  where user_id = v_pending;
  if v_public <> 0 then
    raise exception 'TEST 2 failed: pending identity is public';
  end if;

  alter table public.referrals disable trigger creator_tier_on_referral_change;
  perform public.review_creator_identity(v_coach, 'coach', 'approved', 'qa approve');
  select effective_tier, tier_reason, active_referral_count
  into v_tier, v_reason, v_count
  from public.creator_identities where user_id = v_coach;
  if v_tier <> 'free' or v_reason <> 'free' or v_count <> 0 then
    raise exception 'TEST 3 failed: approved coach did not start on free (% % %)', v_tier, v_reason, v_count;
  end if;

  insert into public.referrals (referrer_id, referred_id, referral_code_id, status, qualified_at, qualification_source)
  values (v_coach, v_friends[1], v_code, 'qualified', v_t0, 'check_in');
  perform public.recalculate_creator_tier(v_coach, v_t0);
  select effective_tier into v_tier from public.creator_identities where user_id = v_coach;
  if v_tier <> 'free' then
    raise exception 'TEST 4 failed: one below base became %', v_tier;
  end if;

  insert into public.referrals (referrer_id, referred_id, referral_code_id, status, qualified_at, qualification_source)
  values (v_coach, v_friends[2], v_code, 'qualified', v_t0, 'check_in');
  perform public.recalculate_creator_tier(v_coach, v_t0);
  select effective_tier, tier_reason, tier_starts_at
  into v_tier, v_reason, v_starts
  from public.creator_identities where user_id = v_coach;
  if v_tier <> 'base' or v_reason <> 'referrals' then
    raise exception 'TEST 4 failed: exact base requirement did not grant base (% %)', v_tier, v_reason;
  end if;

  perform public.recalculate_creator_tier(v_coach, v_t0);
  select tier_starts_at into v_starts_again from public.creator_identities where user_id = v_coach;
  if v_starts_again is distinct from v_starts then
    raise exception 'TEST idempotent failed: recalculation moved the tier start';
  end if;

  insert into public.referrals (referrer_id, referred_id, referral_code_id, status, qualified_at, qualification_source)
  values (v_coach, v_friends[3], v_code, 'qualified', v_t0, 'check_in');
  perform public.recalculate_creator_tier(v_coach, v_t0);
  select effective_tier into v_tier from public.creator_identities where user_id = v_coach;
  if v_tier <> 'base' then
    raise exception 'TEST 5 failed: one below pro became %', v_tier;
  end if;

  insert into public.referrals (referrer_id, referred_id, referral_code_id, status, qualified_at, qualification_source)
  values (v_coach, v_friends[4], v_code, 'qualified', v_t0, 'check_in');
  perform public.recalculate_creator_tier(v_coach, v_t0);
  select effective_tier, tier_reason into v_tier, v_reason
  from public.creator_identities where user_id = v_coach;
  if v_tier <> 'pro' or v_reason <> 'referrals' then
    raise exception 'TEST 5 failed: exact pro requirement did not grant pro (% %)', v_tier, v_reason;
  end if;

  insert into public.referrals (referrer_id, referred_id, referral_code_id, status)
  values (v_coach, v_friends[5], v_code, 'attributed');
  insert into public.referrals (referrer_id, referred_id, referral_code_id, status, qualified_at, qualification_source)
  values (v_coach, v_placeholder, v_code, 'qualified', v_t0, 'check_in');
  perform public.recalculate_creator_tier(v_coach, v_t0);
  select active_referral_count into v_count from public.creator_identities where user_id = v_coach;
  if v_count <> 4 then
    raise exception 'TEST 6 failed: inactive referrals were counted (%)', v_count;
  end if;

  begin
    insert into public.referrals (referrer_id, referred_id, referral_code_id, status, qualified_at, qualification_source)
    values (v_coach, v_friends[1], v_code, 'qualified', v_t0, 'workout');
    raise exception 'TEST 7 failed: duplicate referred user was inserted';
  exception
    when unique_violation then
      null;
  end;
  select active_referral_count into v_count from public.creator_identities where user_id = v_coach;
  if v_count <> 4 then
    raise exception 'TEST 7 failed: duplicate processing changed the count to %', v_count;
  end if;

  perform public.review_creator_identity(v_paid, 'gym', 'approved', 'paid path');
  perform public.set_creator_paid_entitlement(v_paid, 'base', v_t0, v_t0 + interval '30 days');
  select effective_tier, tier_reason, active_referral_count
  into v_tier, v_reason, v_count
  from public.creator_identities where user_id = v_paid;
  if v_tier <> 'base' or v_reason <> 'paid' or v_count <> 0 then
    raise exception 'TEST 8 failed: paid entitlement did not grant base (% % %)', v_tier, v_reason, v_count;
  end if;

  alter table public.referrals disable trigger creator_tier_on_referral_change;
  update public.referrals
  set status = 'invalidated', updated_at = v_t0
  where referrer_id = v_coach and referred_id in (v_friends[2], v_friends[3], v_friends[4]);
  perform public.recalculate_creator_tier(v_coach, v_t0 + interval '5 days');
  select effective_tier, active_referral_count into v_tier, v_count
  from public.creator_identities where user_id = v_coach;
  if v_count <> 1 or v_tier <> 'pro' then
    raise exception 'TEST 9 failed: validity window did not hold pro after count drop (% %)', v_tier, v_count;
  end if;
  perform public.recalculate_creator_tier(v_coach, v_t0 + interval '40 days');
  select effective_tier into v_tier from public.creator_identities where user_id = v_coach;
  if v_tier <> 'free' then
    raise exception 'TEST 9 failed: tier remained % after grace', v_tier;
  end if;

  -- Fresh window so grace can be observed from a known start.
  update public.referrals
  set status = 'qualified', updated_at = v_t0
  where referrer_id = v_coach and referred_id in (v_friends[1], v_friends[2]);
  perform public.recalculate_creator_tier(v_coach, v_t0);
  update public.referrals
  set status = 'invalidated'
  where referrer_id = v_coach and referred_id = v_friends[2];
  perform public.recalculate_creator_tier(v_coach, v_t0 + interval '10 days');
  select effective_tier, active_referral_count into v_tier, v_count
  from public.creator_identities where user_id = v_coach;
  if v_count <> 1 or v_tier <> 'base' then
    raise exception 'TEST 9 grace failed: expected base during grace, got % count %', v_tier, v_count;
  end if;
  perform public.recalculate_creator_tier(v_coach, v_t0 + interval '13 days');
  select effective_tier into v_tier from public.creator_identities where user_id = v_coach;
  if v_tier <> 'free' then
    raise exception 'TEST 9 grace failed: expected free after grace, got %', v_tier;
  end if;
  alter table public.referrals enable trigger creator_tier_on_referral_change;

  update public.referrals
  set status = 'qualified'
  where referrer_id = v_coach and referred_id = v_friends[2];
  select active_referral_count into v_count from public.creator_identities where user_id = v_coach;
  if v_count <> 2 then
    raise exception 'TEST 10 failed: restoring a referral did not recount to 2 (%)', v_count;
  end if;
  update public.referrals
  set status = 'invalidated'
  where referrer_id = v_coach and referred_id = v_friends[2];
  select active_referral_count into v_count from public.creator_identities where user_id = v_coach;
  if v_count <> 1 then
    raise exception 'TEST 10 failed: invalidating a referral did not recount to 1 (%)', v_count;
  end if;
end;
$t$;

-- Recreate the
-- client-role cases with their own synthetic rows.
do $t$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (v_user, 'ct-client-' || v_user || '@gymly.local'),
    (v_other, 'ct-other-' || v_other || '@gymly.local');
  insert into public.profiles (id, username, display_name) values
    (v_user, 'ctclient' || substr(v_user::text, 1, 8), 'Client'),
    (v_other, 'ctother' || substr(v_other::text, 1, 8), 'Other');
  perform public.review_creator_identity(v_user, 'coach', 'approved', 'client target');
  perform public.review_creator_identity(v_other, 'gym', 'pending', 'hidden');
  create temp table ct_ids as
  select v_user as user_id, v_other as other_id;
end;
$t$;

grant select on ct_ids to anon, authenticated, service_role;

savepoint client_write;
grant insert, update, delete, select on public.creator_identities to authenticated;
grant execute on function public.creator_identities_block_client_write() to authenticated;
grant insert, update, delete, select on public.creator_tier_config to authenticated;
drop policy if exists creator_identities_test_open on public.creator_identities;
create policy creator_identities_test_open on public.creator_identities
  for all to authenticated using (true) with check (true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select user_id::text from ct_ids), true);
select set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', (select user_id from ct_ids))::text, true);
set local role authenticated;
do $t$
begin
  update public.creator_identities
  set status = 'approved', identity_type = 'gym', effective_tier = 'pro'
  where user_id = (select user_id from ct_ids);
  raise exception 'TEST 11 failed: authenticated update was allowed';
exception
  when sqlstate 'P0001' then
    if sqlerrm not like '%CREATOR_TIER_WRITE_FORBIDDEN%' then
      raise;
    end if;
end;
$t$;
do $t$
begin
  perform public.review_creator_identity((select user_id from ct_ids), 'gym', 'approved', 'self');
  raise exception 'TEST 1 failed: authenticated review was allowed';
exception
  when insufficient_privilege then
    null;
end;
$t$;
rollback to savepoint client_write;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select user_id::text from ct_ids), true);
select set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', (select user_id from ct_ids))::text, true);
set local role authenticated;
do $t$
declare
  v_status jsonb;
begin
  v_status := public.get_my_creator_tier_status();
  if v_status ->> 'status' <> 'approved' or v_status ->> 'identity_type' <> 'coach' then
    raise exception 'TEST 12 failed: authenticated user could not read own tier status';
  end if;
  begin
    perform 1 from public.creator_identities limit 1;
    raise exception 'TEST 12 failed: authenticated read the private table';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$t$;
reset role;

select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

set local role anon;
do $t$
declare
  v_visible integer;
  v_pending integer;
begin
  select count(*) into v_visible
  from public.creator_public_identities p
  join ct_ids i on i.user_id = p.user_id;
  select count(*) into v_pending
  from public.creator_public_identities p
  join ct_ids i on i.other_id = p.user_id;
  if v_visible <> 1 or v_pending <> 0 then
    raise exception 'TEST 2/12 failed: anon public view counts % approved and % pending', v_visible, v_pending;
  end if;
  begin
    perform 1 from public.creator_identities limit 1;
    raise exception 'TEST 12 failed: anon read the private table';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$t$;
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $t$
declare
  v_status text;
begin
  select public.review_creator_identity((select other_id from ct_ids), 'gym', 'approved', 'server') ->> 'status'
  into v_status;
  if v_status <> 'approved' then
    raise exception 'TEST 12 failed: service role could not approve (% )', v_status;
  end if;
end;
$t$;
reset role;

do $t$
declare
  v_tier text;
begin
  select effective_tier into v_tier
  from public.creator_identities
  where user_id = (select other_id from ct_ids);
  if v_tier <> 'free' then
    raise exception 'TEST 3b failed: service-approved gym did not start free (% )', v_tier;
  end if;
end;
$t$;

rollback;
