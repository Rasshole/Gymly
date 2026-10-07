-- Isolated workspace checks. The outer transaction is rolled back.
begin;

do $t$
declare
  v_free uuid := gen_random_uuid();
  v_paid uuid := gen_random_uuid();
  v_ref uuid := gen_random_uuid();
  v_pro uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_rejected uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_friends uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_code uuid;
  v_g_free uuid;
  v_g_paid uuid;
  v_g_paid_extra uuid;
  v_g_many_admins uuid;
  v_g_ref uuid;
  v_g_pro_a uuid;
  v_g_pro_b uuid;
  v_g_stranger uuid;
  v_g_too_many uuid;
  v_workspace json;
  v_paid_features jsonb;
  v_ref_features jsonb;
  v_links integer;
  v_members integer;
  v_groups integer;
  v_public integer;
  i integer;
begin
  insert into auth.users (id, email) values
    (v_free, 'cw-free-' || v_free || '@gymly.local'),
    (v_paid, 'cw-paid-' || v_paid || '@gymly.local'),
    (v_ref, 'cw-ref-' || v_ref || '@gymly.local'),
    (v_pro, 'cw-pro-' || v_pro || '@gymly.local'),
    (v_pending, 'cw-pending-' || v_pending || '@gymly.local'),
    (v_rejected, 'cw-rejected-' || v_rejected || '@gymly.local'),
    (v_stranger, 'cw-stranger-' || v_stranger || '@gymly.local');
  insert into public.profiles (id, username, display_name) values
    (v_free, 'cwfree' || substr(v_free::text, 1, 8), 'Free'),
    (v_paid, 'cwpaid' || substr(v_paid::text, 1, 8), 'Paid'),
    (v_ref, 'cwref' || substr(v_ref::text, 1, 8), 'Referral'),
    (v_pro, 'cwpro' || substr(v_pro::text, 1, 8), 'Pro'),
    (v_pending, 'cwpend' || substr(v_pending::text, 1, 8), 'Pending'),
    (v_rejected, 'cwrej' || substr(v_rejected::text, 1, 8), 'Rejected'),
    (v_stranger, 'cwstr' || substr(v_stranger::text, 1, 8), 'Stranger');
  for i in 1..5 loop
    insert into auth.users (id, email)
    values (v_friends[i], 'cw-friend-' || i || '-' || v_friends[i] || '@gymly.local');
    insert into public.profiles (id, username, display_name)
    values (v_friends[i], 'cwfriend' || i || substr(v_friends[i]::text, 1, 6), 'Friend ' || i);
  end loop;

  perform public.review_creator_identity(v_free, 'coach', 'approved', 'workspace free');
  perform public.review_creator_identity(v_paid, 'coach', 'approved', 'workspace paid');
  perform public.review_creator_identity(v_ref, 'coach', 'approved', 'workspace referral');
  perform public.review_creator_identity(v_pro, 'gym', 'approved', 'workspace pro');
  perform public.review_creator_identity(v_pending, 'coach', 'pending', 'workspace pending');
  perform public.review_creator_identity(v_rejected, 'gym', 'rejected', 'workspace rejected');
  perform public.set_creator_paid_entitlement(v_paid, 'base', now() - interval '1 day', now() + interval '30 days');
  perform public.set_creator_paid_entitlement(v_pro, 'pro', now() - interval '1 day', now() + interval '30 days');

  insert into public.referral_codes (user_id, code)
  values (v_ref, 'CW' || upper(substr(replace(v_ref::text, '-', ''), 1, 8)))
  returning id into v_code;
  for i in 1..5 loop
    insert into public.referrals (referrer_id, referred_id, referral_code_id, status, qualified_at)
    values (v_ref, v_friends[i], v_code, 'qualified', now());
  end loop;
  perform public.recalculate_creator_tier(v_ref, now());

  insert into public.gymly_groups (name, created_by) values ('CW Free', v_free) returning id into v_g_free;
  insert into public.gymly_groups (name, created_by) values ('CW Paid', v_paid) returning id into v_g_paid;
  insert into public.gymly_groups (name, created_by) values ('CW Paid Extra', v_paid) returning id into v_g_paid_extra;
  insert into public.gymly_groups (name, created_by) values ('CW Many Admins', v_paid) returning id into v_g_many_admins;
  insert into public.gymly_groups (name, created_by) values ('CW Ref', v_ref) returning id into v_g_ref;
  insert into public.gymly_groups (name, created_by) values ('CW Pro A', v_pro) returning id into v_g_pro_a;
  insert into public.gymly_groups (name, created_by) values ('CW Pro B', v_pro) returning id into v_g_pro_b;
  insert into public.gymly_groups (name, created_by) values ('CW Stranger', v_stranger) returning id into v_g_stranger;
  insert into public.gymly_groups (name, created_by) values ('CW Too Many', v_pro) returning id into v_g_too_many;
  insert into public.gymly_group_members (group_id, user_id, role) values
    (v_g_free, v_free, 'admin'),
    (v_g_paid, v_paid, 'admin'),
    (v_g_paid_extra, v_paid, 'admin'),
    (v_g_many_admins, v_paid, 'admin'),
    (v_g_many_admins, v_stranger, 'admin'),
    (v_g_ref, v_ref, 'admin'),
    (v_g_pro_a, v_pro, 'admin'),
    (v_g_pro_b, v_pro, 'admin'),
    (v_g_stranger, v_stranger, 'admin'),
    (v_g_too_many, v_pro, 'admin'),
    (v_g_too_many, v_stranger, 'admin'),
    (v_g_too_many, v_friends[1], 'admin'),
    (v_g_too_many, v_friends[2], 'admin');
  insert into public.gymly_group_sessions (
    group_id, gym_id, started_by, started_at, ended_at, status, qualifies_as_together
  ) values (
    v_g_paid, 'qa-gym', v_paid, now() - interval '1 day', now() - interval '20 hours', 'completed', true
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_free::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_free)::text, true);
  v_workspace := public.save_my_creator_profile('Fri coach', 'https://gymly.local/free');
  if (v_workspace -> 'features' ->> 'group_sessions')::boolean
     or not (v_workspace -> 'features' ->> 'referral_counts')::boolean
     or (v_workspace -> 'features' ->> 'add_administrator')::boolean
     or (v_workspace -> 'features' ->> 'max_official_groups')::integer <> 0
     or v_workspace ->> 'referral_code' is null
     or v_workspace ->> 'next_tier' <> 'base'
     or (v_workspace ->> 'active_referrals') is distinct from (public.get_my_creator_tier_status() ->> 'active_referrals')
     or (v_workspace ->> 'next_tier') is distinct from (public.get_my_creator_tier_status() ->> 'next_tier')
     or (v_workspace ->> 'next_tier_required') is distinct from (public.get_my_creator_tier_status() ->> 'next_tier_required')
     or (v_workspace ->> 'next_tier_required')::integer <> (
       select base_active_referrals
       from public.creator_tier_config
       where identity_type = 'coach'
     ) then
    raise exception 'TEST free features were wrong';
  end if;
  begin
    perform public.link_my_official_group(v_g_free);
    raise exception 'TEST free link was allowed';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_TIER_FEATURE_LOCKED%' then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', v_pending::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_pending)::text, true);
  begin
    perform public.save_my_creator_profile('Skjult', 'https://gymly.local/pending');
    raise exception 'TEST pending profile save was allowed';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_TIER_NOT_APPROVED%' then
        raise;
      end if;
  end;
  v_workspace := public.get_my_creator_workspace();
  if v_workspace ->> 'status' <> 'pending'
     or (v_workspace ->> 'public_visible')::boolean
     or v_workspace ->> 'description' is not null
     or v_workspace ->> 'active_referrals' is not null
     or v_workspace ->> 'next_tier' is not null
     or v_workspace ->> 'referral_code' is not null then
    raise exception 'TEST pending workspace looked approved';
  end if;

  perform set_config('request.jwt.claim.sub', v_rejected::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_rejected)::text, true);
  v_workspace := public.get_my_creator_workspace();
  if v_workspace ->> 'status' <> 'rejected' or (v_workspace ->> 'public_visible')::boolean then
    raise exception 'TEST rejected workspace looked approved';
  end if;

  perform set_config('request.jwt.claim.sub', v_paid::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_paid)::text, true);
  v_paid_features := (public.get_my_creator_workspace() -> 'features')::jsonb;
  perform public.link_my_official_group(v_g_paid);
  perform public.link_my_official_group(v_g_paid);
  select count(*) into v_links from public.creator_official_groups where user_id = v_paid;
  if v_links <> 1 then
    raise exception 'TEST double link counted %', v_links;
  end if;
  v_workspace := public.get_my_creator_workspace();
  if (v_workspace -> 'official_groups' -> 0 ->> 'together_sessions')::integer <> 1
     or not (v_workspace -> 'official_groups' -> 0 ->> 'admin_access')::boolean then
    raise exception 'TEST base session count missing';
  end if;
  if v_workspace -> 'official_groups' -> 0 ->> 'recent_sessions' like '%user_id%'
     or v_workspace -> 'official_groups' -> 0 ->> 'recent_sessions' like '%display_name%' then
    raise exception 'TEST session payload exposed a member';
  end if;

  perform set_config('request.jwt.claim.sub', v_free::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_free)::text, true);
  perform public.unlink_my_official_group(v_g_paid);
  select count(*) into v_links
  from public.creator_official_groups
  where user_id = v_paid and group_id = v_g_paid;
  if v_links <> 1 then
    raise exception 'TEST another identity removed an official link';
  end if;

  perform set_config('request.jwt.claim.sub', v_paid::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_paid)::text, true);
  update public.gymly_group_members
  set role = 'member'
  where group_id = v_g_paid and user_id = v_paid;
  if public.gymly_is_group_admin(v_g_paid, v_paid) then
    raise exception 'TEST demotion left the admin role';
  end if;
  v_workspace := public.get_my_creator_workspace();
  if (v_workspace -> 'official_groups' -> 0 ->> 'admin_access')::boolean
     or v_workspace -> 'official_groups' -> 0 ->> 'together_sessions' is not null
     or v_workspace -> 'official_groups' -> 0 ->> 'recent_sessions' is not null then
    raise exception 'TEST former admin kept group access through the link';
  end if;
  if not exists (
    select 1 from public.creator_official_groups
    where user_id = v_paid and group_id = v_g_paid
  ) then
    raise exception 'TEST demotion removed the official link';
  end if;
  begin
    perform public.gymly_delete_group(v_g_paid);
    raise exception 'TEST former admin deleted the linked group';
  exception
    when others then
      if sqlerrm not like '%forbidden%' then
        raise;
      end if;
  end;
  if not exists (select 1 from public.gymly_groups where id = v_g_paid)
     or not exists (select 1 from public.gymly_group_sessions where group_id = v_g_paid) then
    raise exception 'TEST former admin removed group content';
  end if;
  update public.gymly_group_members
  set role = 'admin'
  where group_id = v_g_paid and user_id = v_paid;
  begin
    perform public.link_my_official_group(v_g_paid_extra);
    raise exception 'TEST second official group was allowed on base';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_TIER_FEATURE_LOCKED%' then
        raise;
      end if;
  end;
  begin
    perform public.link_my_official_group(v_g_stranger);
    raise exception 'TEST non-admin link was allowed';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_GROUP_ADMIN_REQUIRED%' then
        raise;
      end if;
  end;
  begin
    perform public.link_my_official_group(v_g_many_admins);
    raise exception 'TEST group over the admin cap was linked';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_TIER_FEATURE_LOCKED%' then
        raise;
      end if;
  end;
  perform set_config('request.jwt.claim.sub', v_ref::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_ref)::text, true);
  v_workspace := public.get_my_creator_workspace();
  if v_workspace ->> 'effective_tier' <> 'base' or v_workspace ->> 'tier_reason' <> 'referrals' then
    raise exception 'TEST referral coach did not reach base';
  end if;
  v_ref_features := (v_workspace -> 'features')::jsonb;
  if v_ref_features <> v_paid_features then
    raise exception 'TEST paid and referral base features differed';
  end if;
  if coalesce((v_workspace ->> 'active_referrals')::integer, -1) <> 5 then
    raise exception 'TEST referral count was not 5';
  end if;
  perform public.link_my_official_group(v_g_ref);

  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_stranger)::text, true);
  begin
    perform public.link_my_official_group(v_g_paid);
    raise exception 'TEST stranger linked another coach group';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_TIER_NOT_APPROVED%' and sqlerrm not like '%CREATOR_GROUP_ADMIN_REQUIRED%' then
        raise;
      end if;
  end;
  begin
    perform public.save_my_creator_profile('Ikke min', 'https://gymly.local/nope');
    raise exception 'TEST stranger saved a creator profile';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_TIER_NOT_APPROVED%' then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', v_pro::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_pro)::text, true);
  begin
    perform public.link_my_official_group(v_g_too_many);
    raise exception 'TEST pro linked a group over the admin cap';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%CREATOR_GROUP_ADMIN_LIMIT%' then
        raise;
      end if;
  end;
  perform public.link_my_official_group(v_g_pro_a);
  perform public.link_my_official_group(v_g_pro_b);
  v_workspace := public.get_my_creator_workspace();
  if jsonb_array_length((v_workspace -> 'official_groups')::jsonb) <> 2
     or (v_workspace -> 'features' ->> 'max_official_groups')::integer <> 3
     or (v_workspace -> 'features' ->> 'add_administrator')::boolean
     or v_workspace ->> 'tier_reason' <> 'paid' then
    raise exception 'TEST pro groups or admin flag were wrong';
  end if;

  update public.referrals
  set status = 'invalidated'
  where referrer_id = v_ref;
  perform public.recalculate_creator_tier(v_ref, now() + interval '40 days');
  select count(*) into v_links from public.creator_official_groups where user_id = v_ref;
  select count(*) into v_members from public.gymly_group_members where group_id = v_g_ref;
  select count(*) into v_groups from public.gymly_groups where id = v_g_ref;
  if v_links <> 1 or v_members <> 1 or v_groups <> 1 then
    raise exception 'TEST expiry removed group data % % %', v_links, v_members, v_groups;
  end if;
  perform set_config('request.jwt.claim.sub', v_ref::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_ref)::text, true);
  v_workspace := public.get_my_creator_workspace();
  if v_workspace ->> 'effective_tier' <> 'free'
     or (v_workspace -> 'features' ->> 'group_sessions')::boolean
     or not (v_workspace -> 'features' ->> 'referral_counts')::boolean
     or v_workspace ->> 'next_tier' <> 'base'
     or jsonb_array_length((v_workspace -> 'official_groups')::jsonb) <> 1
     or v_workspace -> 'official_groups' -> 0 ->> 'together_sessions' is not null then
    raise exception 'TEST expiry did not limit features only';
  end if;

  perform set_config('request.jwt.claim.sub', v_paid::text, true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_paid)::text, true);
  perform public.unlink_my_official_group(v_g_paid);
  perform public.unlink_my_official_group(v_g_paid);
  select count(*) into v_links
  from public.creator_official_groups
  where user_id = v_paid and group_id = v_g_paid;
  if v_links <> 0 then
    raise exception 'TEST unlink left the official link';
  end if;
  if not exists (select 1 from public.gymly_groups where id = v_g_paid)
     or not exists (
       select 1 from public.gymly_group_members
       where group_id = v_g_paid and user_id = v_paid
     )
     or not exists (select 1 from public.gymly_group_sessions where group_id = v_g_paid) then
    raise exception 'TEST unlink deleted group content';
  end if;

  select count(*) into v_public
  from public.creator_public_profile_cards
  where user_id in (v_pending, v_rejected);
  if v_public <> 0 then
    raise exception 'TEST pending or rejected profile was public';
  end if;
  select count(*) into v_public
  from public.creator_public_profile_cards
  where user_id = v_free and description = 'Fri coach';
  if v_public <> 1 then
    raise exception 'TEST approved profile was not public';
  end if;
end;
$t$;

savepoint client_write;
grant insert, update, delete, select on public.creator_profile_details to authenticated;
grant insert, update, delete, select on public.creator_official_groups to authenticated;
grant execute on function public.creator_workspace_block_client_write() to authenticated;
set local role authenticated;
do $t$
begin
  insert into public.creator_profile_details (user_id, description)
  values ('00000000-0000-0000-0000-000000000000', 'direkte');
  raise exception 'TEST client insert was allowed';
exception
  when sqlstate 'P0001' then
    if sqlerrm not like '%CREATOR_WORKSPACE_WRITE_FORBIDDEN%' then
      raise;
    end if;
end;
$t$;
reset role;
rollback to savepoint client_write;

set local role anon;
do $t$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.creator_public_profile_cards;
  if v_visible < 1 then
    raise exception 'TEST anon could not read an approved card';
  end if;
  begin
    perform 1 from public.creator_profile_details limit 1;
    raise exception 'TEST anon read private profile details';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform 1 from public.creator_tier_feature_config limit 1;
    raise exception 'TEST anon read feature config';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$t$;
reset role;

rollback;
