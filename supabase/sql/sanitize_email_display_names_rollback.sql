-- CONDITIONAL rollback of display-name email cleanup.
-- Prefer FORWARD FIX (re-run cleanup / keep triggers) over restoring emails.
--
-- WARNING: Restoring old_value when it is email-like RE-OPENS public email exposure.
-- Only use when a verified snapshot restore is unavailable and you accept that risk.
--
-- SAFETY: Does NOT overwrite a name the user (or later process) changed after cleanup.
-- Restore only when the live column still equals backup.new_value (unchanged since clean).
--
-- Never export gymly_ops.display_name_email_cleanup_20260921.old_value to Git or chat.

begin;

alter table public.profiles disable trigger trg_profiles_sanitize_display_name;
alter table public.check_ins disable trigger trg_check_ins_sanitize_user_display_name;
alter table public.workout_live_sessions disable trigger trg_workout_live_sanitize_user_display_name;
do $p$
begin
  if to_regclass('public.posts') is not null then
    execute 'alter table public.posts disable trigger trg_posts_sanitize_author_display_name';
  end if;
end;
$p$;

-- profiles: only if still at cleaned sentinel
update public.profiles p
set
  display_name = b.old_value,
  updated_at = now()
from gymly_ops.display_name_email_cleanup_20260921 b
where b.source_table = 'profiles'
  and b.column_name = 'display_name'
  and p.id = b.row_pk::uuid
  and p.display_name is not distinct from b.new_value
  and b.id = (
    select max(b2.id)
    from gymly_ops.display_name_email_cleanup_20260921 b2
    where b2.source_table = 'profiles'
      and b2.row_pk = b.row_pk
      and b2.column_name = 'display_name'
  );

update public.check_ins c
set user_display_name = b.old_value
from gymly_ops.display_name_email_cleanup_20260921 b
where b.source_table = 'check_ins'
  and b.column_name = 'user_display_name'
  and c.id = b.row_pk::uuid
  and c.user_display_name is not distinct from b.new_value
  and b.id = (
    select max(b2.id)
    from gymly_ops.display_name_email_cleanup_20260921 b2
    where b2.source_table = 'check_ins'
      and b2.row_pk = b.row_pk
      and b2.column_name = 'user_display_name'
  );

update public.workout_live_sessions l
set user_display_name = b.old_value
from gymly_ops.display_name_email_cleanup_20260921 b
where b.source_table = 'workout_live_sessions'
  and b.column_name = 'user_display_name'
  and l.user_id = b.row_pk::uuid
  and l.user_display_name is not distinct from b.new_value
  and b.id = (
    select max(b2.id)
    from gymly_ops.display_name_email_cleanup_20260921 b2
    where b2.source_table = 'workout_live_sessions'
      and b2.row_pk = b.row_pk
      and b2.column_name = 'user_display_name'
  );

do $posts$
begin
  if to_regclass('public.posts') is null then
    return;
  end if;
  execute $u$
    update public.posts p
    set author_display_name = b.old_value
    from gymly_ops.display_name_email_cleanup_20260921 b
    where b.source_table = 'posts'
      and b.column_name = 'author_display_name'
      and p.id = b.row_pk::uuid
      and p.author_display_name is not distinct from b.new_value
      and b.id = (
        select max(b2.id)
        from gymly_ops.display_name_email_cleanup_20260921 b2
        where b2.source_table = 'posts'
          and b2.row_pk = b.row_pk
          and b2.column_name = 'author_display_name'
      )
  $u$;
end;
$posts$;

alter table public.profiles enable trigger trg_profiles_sanitize_display_name;
alter table public.check_ins enable trigger trg_check_ins_sanitize_user_display_name;
alter table public.workout_live_sessions enable trigger trg_workout_live_sanitize_user_display_name;
do $p2$
begin
  if to_regclass('public.posts') is not null then
    execute 'alter table public.posts enable trigger trg_posts_sanitize_author_display_name';
  end if;
end;
$p2$;

-- Counts only
select source_table, count(*)::bigint as backup_rows
from gymly_ops.display_name_email_cleanup_20260921
group by source_table
order by 1;

commit;

-- After any restore of email-like old_value: public exposure is open again until
-- forward cleanup is re-applied. Prefer: keep triggers + re-run cleanup DO block.
