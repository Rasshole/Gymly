create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'biceps',
  created_at timestamptz not null default now(),
  constraint post_reactions_type_check check (type in ('biceps'))
);

create unique index if not exists post_reactions_unique_post_user_type
  on public.post_reactions (post_id, user_id, type);

create index if not exists post_reactions_post_type_created_idx
  on public.post_reactions (post_id, type, created_at desc);

alter table public.post_reactions enable row level security;

drop policy if exists "post_reactions_select_authenticated" on public.post_reactions;
create policy "post_reactions_select_authenticated"
  on public.post_reactions
  for select
  to authenticated
  using (true);

drop policy if exists "post_reactions_insert_own" on public.post_reactions;
create policy "post_reactions_insert_own"
  on public.post_reactions
  for insert
  to authenticated
  with check (auth.uid() = user_id and type = 'biceps');

drop policy if exists "post_reactions_delete_own" on public.post_reactions;
create policy "post_reactions_delete_own"
  on public.post_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

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
    'gymly_group_invite',
    'gymly_group_invite_declined',
    'gymly_group_member_joined',
    'gymly_group_message',
    'gymly_planned_in_group',
    'gymly_group_check_in'
  ));

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
    select 1
    from public.post_reactions r
    where r.post_id = p_post_id
      and r.user_id = v_uid
      and r.type = 'biceps'
  ) then
    delete from public.post_reactions r
    where r.post_id = p_post_id
      and r.user_id = v_uid
      and r.type = 'biceps';

    reacted := false;
  else
    insert into public.post_reactions (post_id, user_id, type)
    values (p_post_id, v_uid, 'biceps')
    on conflict (post_id, user_id, type) do nothing;

    reacted := true;

    if v_post_owner <> v_uid then
      select coalesce(
        nullif(trim(p.display_name), ''),
        nullif(trim(p.username), ''),
        'En bruger'
      )
      into v_actor_name
      from public.profiles p
      where p.id = v_uid;

      insert into public.notifications (user_id, actor_user_id, type, title, body, data)
      values (
        v_post_owner,
        v_uid,
        'biceps_reaction',
        'Ny biceps',
        coalesce(v_actor_name, 'En bruger') || ' gav din træning en biceps',
        jsonb_build_object(
          'postId', p_post_id::text,
          'reactorUserId', v_uid::text
        )
      );
    end if;
  end if;

  select count(*)::int
  into reactions_count
  from public.post_reactions r
  where r.post_id = p_post_id
    and r.type = 'biceps';

  return next;
end;
$$;

revoke all on function public.toggle_post_biceps_reaction(uuid) from public;
grant execute on function public.toggle_post_biceps_reaction(uuid) to authenticated;
