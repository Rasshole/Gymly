-- READ-ONLY dry-run: count email-like public display names (no raw values).
-- Includes posts.author_display_name when the table exists.
-- Never SELECT the raw name values into logs/chat/Git — counts only.

select
  (select count(*)::bigint from public.profiles p
    where length(btrim(p.display_name)) > 0
      and (
        btrim(p.display_name) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        or btrim(p.display_name) ~* '@privaterelay\.appleid\.com$'
      )) as profiles_email_like_display_name,
  (select count(*)::bigint from public.check_ins c
    where length(btrim(c.user_display_name)) > 0
      and (
        btrim(c.user_display_name) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        or btrim(c.user_display_name) ~* '@privaterelay\.appleid\.com$'
      )) as check_ins_email_like_user_display_name,
  (select count(*)::bigint from public.check_ins c
    where c.is_active is true
      and c.ended_at is null
      and length(btrim(c.user_display_name)) > 0
      and (
        btrim(c.user_display_name) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        or btrim(c.user_display_name) ~* '@privaterelay\.appleid\.com$'
      )) as check_ins_active_email_like,
  (select count(*)::bigint from public.workout_live_sessions l
    where length(btrim(l.user_display_name)) > 0
      and (
        btrim(l.user_display_name) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        or btrim(l.user_display_name) ~* '@privaterelay\.appleid\.com$'
      )) as workout_live_email_like_user_display_name,
  (select case
      when to_regclass('public.posts') is null then null
      else (
        select count(*)::bigint from public.posts p
        where length(btrim(p.author_display_name)) > 0
          and (
            btrim(p.author_display_name) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
            or btrim(p.author_display_name) ~* '@privaterelay\.appleid\.com$'
          )
      )
    end) as posts_email_like_author_display_name;
