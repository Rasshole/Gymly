-- Structural + semantic rule checks for sanitize_email_display_names migration.
-- Run AFTER applying 20260921120000_sanitize_email_display_names.sql on a local/test DB.
-- Never prints email values.

select
  'helpers_exist' as rule,
  to_regprocedure('public.is_email_like_display_name(text)') is not null
  and to_regprocedure('public.is_usable_public_display_name(text)') is not null
  and to_regprocedure('public.resolved_profile_public_display_name(uuid)') is not null
  and to_regprocedure('public.sanitize_incoming_public_display_name(text,uuid)') is not null
  as ok;

select
  'triggers_exist' as rule,
  exists (select 1 from pg_trigger where tgname = 'trg_profiles_sanitize_display_name' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgname = 'trg_check_ins_sanitize_user_display_name' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgname = 'trg_workout_live_sanitize_user_display_name' and not tgisinternal)
  and (
    to_regclass('public.posts') is null
    or exists (select 1 from pg_trigger where tgname = 'trg_posts_sanitize_author_display_name' and not tgisinternal)
  )
  as ok;

select
  'email_predicate_samples' as rule,
  public.is_email_like_display_name('user@example.com')
  and public.is_email_like_display_name('abc@privaterelay.appleid.com')
  and not public.is_email_like_display_name('Sofie Hansen')
  as ok;

select
  'zero_email_like_remaining' as rule,
  not exists (select 1 from public.profiles p where public.is_email_like_display_name(p.display_name))
  and not exists (select 1 from public.check_ins c where public.is_email_like_display_name(c.user_display_name))
  and not exists (select 1 from public.workout_live_sessions l where public.is_email_like_display_name(l.user_display_name))
  and (
    to_regclass('public.posts') is null
    or not exists (
      select 1 from public.posts p where public.is_email_like_display_name(p.author_display_name)
    )
  )
  as ok;

select
  'ops_backup_locked_down' as rule,
  to_regclass('gymly_ops.display_name_email_cleanup_20260921') is not null
  and not has_table_privilege('anon', 'gymly_ops.display_name_email_cleanup_20260921', 'select')
  and not has_table_privilege('authenticated', 'gymly_ops.display_name_email_cleanup_20260921', 'select')
  and not has_table_privilege('service_role', 'gymly_ops.display_name_email_cleanup_20260921', 'select')
  as ok;

select
  'sanitizer_not_security_definer' as rule,
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'is_email_like_display_name',
        'is_usable_public_display_name',
        'resolved_profile_public_display_name',
        'sanitize_incoming_public_display_name',
        'display_name_for_user'
      )
      and prosecdef
  ) as ok;

select
  'helper_search_path_public' as rule,
  (
    select prosecdef is false
      and pg_get_functiondef(p.oid) ilike '%set search_path%public%'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sanitize_incoming_public_display_name'
    limit 1
  ) as ok;
