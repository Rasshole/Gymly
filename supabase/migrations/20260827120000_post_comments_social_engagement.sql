-- Post comments, comment likes, realtime, grouped post-like notifications

-- ---------------------------------------------------------------------------
-- post_comments
-- ---------------------------------------------------------------------------
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint post_comments_body_not_empty check (char_length(trim(body)) > 0)
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at asc)
  where deleted_at is null;

alter table public.post_comments enable row level security;

drop policy if exists "post_comments_select_authenticated" on public.post_comments;
create policy "post_comments_select_authenticated"
  on public.post_comments for select to authenticated
  using (deleted_at is null);

drop policy if exists "post_comments_insert_own" on public.post_comments;
create policy "post_comments_insert_own"
  on public.post_comments for insert to authenticated
  with check (auth.uid() = user_id and deleted_at is null);

drop policy if exists "post_comments_update_own" on public.post_comments;
create policy "post_comments_update_own"
  on public.post_comments for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- comment_likes (biceps on comments)
-- ---------------------------------------------------------------------------
create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'biceps',
  created_at timestamptz not null default now(),
  constraint comment_likes_type_check check (reaction_type in ('biceps'))
);

create unique index if not exists comment_likes_unique_comment_user
  on public.comment_likes (comment_id, user_id);

create index if not exists comment_likes_comment_idx
  on public.comment_likes (comment_id, created_at desc);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_authenticated" on public.comment_likes;
create policy "comment_likes_select_authenticated"
  on public.comment_likes for select to authenticated using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
  on public.comment_likes for insert to authenticated
  with check (auth.uid() = user_id and reaction_type = 'biceps');

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
  on public.comment_likes for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- notifications: group_key + new social types
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists group_key text;

create index if not exists notifications_user_group_key_idx
  on public.notifications (user_id, group_key)
  where group_key is not null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'friend_request',
    'friend_request_accepted',
    'friend_checked_in',
    'badge_unlocked',
    'streak_milestone',
    'badge_progress',
    'planned_workout_invite',
    'planned_workout_accepted',
    'planned_workout_declined',
    'planned_workout_reminder',
    'dm_message',
    'workout_reminder',
    'workout_reaction',
    'biceps_reaction',
    'post_like',
    'post_comment',
    'comment_like',
    'gymly_group_invite',
    'gymly_group_invite_declined',
    'gymly_group_member_joined',
    'gymly_group_message',
    'gymly_planned_in_group',
    'gymly_group_check_in'
  ));

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
do $r$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_reactions'
  ) then
    alter publication supabase_realtime add table public.post_reactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_comments'
  ) then
    alter publication supabase_realtime add table public.post_comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_likes'
  ) then
    alter publication supabase_realtime add table public.comment_likes;
  end if;
exception when undefined_object then null;
end $r$;

do $r$ begin
  if to_regclass('public.post_reactions') is not null then
    execute 'alter table public.post_reactions replica identity full';
  end if;
  if to_regclass('public.post_comments') is not null then
    execute 'alter table public.post_comments replica identity full';
  end if;
  if to_regclass('public.comment_likes') is not null then
    execute 'alter table public.comment_likes replica identity full';
  end if;
end $r$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.display_name_for_user(p_user_id uuid)
returns text
language sql
stable
set search_path = public
as $s$
  select coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.username), ''),
    'User'
  )
  from public.profiles p
  where p.id = p_user_id;
$s$;

create or replace function public.upsert_post_like_notification(
  p_post_owner uuid,
  p_post_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_like_count int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_key text := 'post_like:' || p_post_id::text;
  v_title text;
  v_body text;
  v_type text := 'post_like';
begin
  if p_post_owner = p_actor_id then
    return;
  end if;

  if p_like_count > 10 then
    v_title := 'Workout';
    v_body := '10+ people liked your workout 💪';
    delete from public.notifications n
    where n.user_id = p_post_owner
      and n.group_key = v_group_key
      and n.type in ('post_like', 'biceps_reaction');
    insert into public.notifications (user_id, actor_user_id, type, title, body, data, group_key)
    values (
      p_post_owner,
      p_actor_id,
      v_type,
      v_title,
      v_body,
      jsonb_build_object(
        'postId', p_post_id::text,
        'likeCount', p_like_count,
        'grouped', true,
        'actorUserId', p_actor_id::text,
        'actorName', p_actor_name
      ),
      v_group_key
    );
    return;
  end if;

  if p_like_count >= 2 then
    v_title := 'Workout';
    v_body := p_like_count::text || ' people liked your workout 💪';
    update public.notifications n
    set
      actor_user_id = p_actor_id,
      body = v_body,
      data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object(
        'postId', p_post_id::text,
        'likeCount', p_like_count,
        'grouped', true,
        'actorUserId', p_actor_id::text,
        'actorName', p_actor_name
      ),
      is_read = false,
      created_at = now()
    where n.user_id = p_post_owner
      and n.group_key = v_group_key
      and n.type in ('post_like', 'biceps_reaction');
    if found then
      return;
    end if;
    insert into public.notifications (user_id, actor_user_id, type, title, body, data, group_key)
    values (
      p_post_owner,
      p_actor_id,
      v_type,
      v_title,
      v_body,
      jsonb_build_object(
        'postId', p_post_id::text,
        'likeCount', p_like_count,
        'grouped', true,
        'actorUserId', p_actor_id::text,
        'actorName', p_actor_name
      ),
      v_group_key
    );
    return;
  end if;

  v_title := 'Workout';
  v_body := coalesce(p_actor_name, 'Someone') || ' liked your workout 💪';
  insert into public.notifications (user_id, actor_user_id, type, title, body, data, group_key)
  values (
    p_post_owner,
    p_actor_id,
    v_type,
    v_title,
    v_body,
    jsonb_build_object(
      'postId', p_post_id::text,
      'likeCount', 1,
      'grouped', false,
      'actorUserId', p_actor_id::text,
      'actorName', p_actor_name
    ),
    v_group_key
  );
end;
$$;

create or replace function public.toggle_post_biceps_reaction(
  p_post_id uuid
) returns table(reacted boolean, reactions_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post_owner uuid;
  v_actor_name text;
  v_like_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.user_id into v_post_owner
  from public.posts p
  where p.id = p_post_id;

  if v_post_owner is null then
    raise exception 'post_not_found';
  end if;

  if exists (
    select 1 from public.post_reactions r
    where r.post_id = p_post_id and r.user_id = v_uid and r.type = 'biceps'
  ) then
    delete from public.post_reactions r
    where r.post_id = p_post_id and r.user_id = v_uid and r.type = 'biceps';
    reacted := false;
  else
    insert into public.post_reactions (post_id, user_id, type)
    values (p_post_id, v_uid, 'biceps')
    on conflict (post_id, user_id, type) do nothing;
    reacted := true;

    if v_post_owner <> v_uid then
      v_actor_name := public.display_name_for_user(v_uid);
      select count(*)::int into v_like_count
      from public.post_reactions r
      where r.post_id = p_post_id and r.type = 'biceps';
      perform public.upsert_post_like_notification(
        v_post_owner, p_post_id, v_uid, v_actor_name, v_like_count
      );
    end if;
  end if;

  select count(*)::int into reactions_count
  from public.post_reactions r
  where r.post_id = p_post_id and r.type = 'biceps';

  return next;
end;
$$;

create or replace function public.create_post_comment(
  p_post_id uuid,
  p_body text
) returns public.post_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post_owner uuid;
  v_actor_name text;
  v_trimmed text;
  v_row public.post_comments;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_trimmed := trim(p_body);
  if char_length(v_trimmed) = 0 then
    raise exception 'empty_comment';
  end if;

  select p.user_id into v_post_owner
  from public.posts p
  where p.id = p_post_id;

  if v_post_owner is null then
    raise exception 'post_not_found';
  end if;

  insert into public.post_comments (post_id, user_id, body)
  values (p_post_id, v_uid, v_trimmed)
  returning * into v_row;

  if v_post_owner <> v_uid then
    v_actor_name := public.display_name_for_user(v_uid);
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      v_post_owner,
      v_uid,
      'post_comment',
      'Comment',
      coalesce(v_actor_name, 'Someone') || ' commented on your workout',
      jsonb_build_object(
        'postId', p_post_id::text,
        'commentId', v_row.id::text,
        'actorUserId', v_uid::text,
        'actorName', v_actor_name
      )
    );
  end if;

  return v_row;
end;
$$;

create or replace function public.toggle_comment_biceps(
  p_comment_id uuid
) returns table(reacted boolean, reactions_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment_owner uuid;
  v_post_id uuid;
  v_actor_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select c.user_id, c.post_id
  into v_comment_owner, v_post_id
  from public.post_comments c
  where c.id = p_comment_id and c.deleted_at is null;

  if v_comment_owner is null then
    raise exception 'comment_not_found';
  end if;

  if exists (
    select 1 from public.comment_likes l
    where l.comment_id = p_comment_id and l.user_id = v_uid
  ) then
    delete from public.comment_likes l
    where l.comment_id = p_comment_id and l.user_id = v_uid;
    reacted := false;
  else
    insert into public.comment_likes (comment_id, user_id, reaction_type)
    values (p_comment_id, v_uid, 'biceps')
    on conflict (comment_id, user_id) do nothing;
    reacted := true;

    if v_comment_owner <> v_uid then
      v_actor_name := public.display_name_for_user(v_uid);
      insert into public.notifications (user_id, actor_user_id, type, title, body, data)
      values (
        v_comment_owner,
        v_uid,
        'comment_like',
        'Comment',
        coalesce(v_actor_name, 'Someone') || ' liked your comment 💪',
        jsonb_build_object(
          'postId', v_post_id::text,
          'commentId', p_comment_id::text,
          'actorUserId', v_uid::text,
          'actorName', v_actor_name
        )
      );
    end if;
  end if;

  select count(*)::int into reactions_count
  from public.comment_likes l
  where l.comment_id = p_comment_id;

  return next;
end;
$$;

revoke all on function public.create_post_comment(uuid, text) from public;
grant execute on function public.create_post_comment(uuid, text) to authenticated;

revoke all on function public.toggle_comment_biceps(uuid) from public;
grant execute on function public.toggle_comment_biceps(uuid) to authenticated;
