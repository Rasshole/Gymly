-- Invite 5 Friends — explicit product-rule inspection (run in Supabase SQL Editor after migration).
-- Not executed by Jest CI; paired with __tests__/inviteFiveFriendsReferral.test.ts.
-- Email verification is intentionally NOT required.

-- 1) Self-referrals rejected (apply_referral_code body)
select
  'self_referral_rejected' as rule,
  pg_get_functiondef('public.apply_referral_code(text)'::regprocedure)
    like '%REFERRAL_SELF_NOT_ALLOWED%' as ok;

-- 2) One referrer per referred account (unique referred_id)
select
  'one_referrer_per_referred' as rule,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'referrals'
      and indexdef ilike '%unique%referred_id%'
  ) as ok;

-- 3) Apply window uses auth.users.created_at within 24 hours
select
  'apply_window_24h_created_at' as rule,
  pg_get_functiondef('public.apply_referral_code(text)'::regprocedure)
    like '%auth.users%'
  and pg_get_functiondef('public.apply_referral_code(text)'::regprocedure)
    like '%24 hours%'
  and pg_get_functiondef('public.apply_referral_code(text)'::regprocedure)
    like '%REFERRAL_APPLY_WINDOW_EXPIRED%' as ok;

-- 4) Idempotent qualify (already_qualified + update only attributed)
select
  'qualify_idempotent' as rule,
  pg_get_functiondef('public.qualify_referral_for_user(uuid, text)'::regprocedure)
    like '%already_qualified%'
  and pg_get_functiondef('public.qualify_referral_for_user(uuid, text)'::regprocedure)
    like '%and r.status = ''attributed''%' as ok;

-- 5) Concurrent fifth cannot duplicate reward / badge
select
  'no_duplicate_reward_or_badge' as rule,
  exists (
    select 1 from pg_constraint
    where conname = 'referral_rewards_user_campaign_key'
  )
  and pg_get_functiondef('public.try_unlock_invite_five_reward(uuid)'::regprocedure)
    like '%on conflict on constraint referral_rewards_user_campaign_key do nothing%'
  and pg_get_functiondef('public.try_unlock_invite_five_reward(uuid)'::regprocedure)
    like '%on conflict (user_id, badge_id)%' as ok;

-- 6) Client cannot award referral_founder_5
select
  'founder_badge_server_only' as rule,
  exists (
    select 1 from pg_trigger
    where tgname = 'trg_user_badges_block_referral_founder'
  )
  and pg_get_functiondef('public.user_badges_block_referral_founder_client_write()'::regprocedure)
    like '%REFERRAL_FOUNDER_BADGE_SERVER_ONLY%' as ok;

-- 7) Failed referral qualify never rolls back checkout
select
  'qualify_never_rolls_back_checkout' as rule,
  pg_get_functiondef('public.referral_on_check_in_completed()'::regprocedure)
    like '%referral qualify skipped for check_in%'
  and pg_get_functiondef('public.referral_on_check_in_completed()'::regprocedure)
    like '%exception%' as ok;

-- 8) Workout completion is covered by check-in ended_at (no separate workout trigger)
select
  'workout_covered_by_check_in_trigger' as rule,
  exists (
    select 1 from pg_trigger
    where tgname = 'trg_referral_on_check_in_completed'
  )
  and not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'workout_sets'
      and t.tgname ilike '%referral%'
  )
  and pg_get_functiondef('public.qualify_referral_for_user(uuid, text)'::regprocedure)
    like '%workout_sets%' as ok;

-- 9) No email-verification dependency in referral RPCs
select
  'no_email_verification_dependency' as rule,
  pg_get_functiondef('public.apply_referral_code(text)'::regprocedure)
    not like '%email_confirmed%'
  and pg_get_functiondef('public.qualify_referral_for_user(uuid, text)'::regprocedure)
    not like '%email_confirmed%' as ok;
