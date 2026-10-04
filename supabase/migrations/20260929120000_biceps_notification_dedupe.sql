-- Keep one 💪 notification per post. A second tap from the same person
-- must not insert another row or mark the existing one unread again.

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
  update public.notifications n
  set
    actor_user_id = p_actor_id,
    title = v_title,
    body = v_body,
    data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object(
      'postId', p_post_id::text,
      'likeCount', 1,
      'grouped', false,
      'actorUserId', p_actor_id::text,
      'actorName', p_actor_name
    )
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
      'likeCount', 1,
      'grouped', false,
      'actorUserId', p_actor_id::text,
      'actorName', p_actor_name
    ),
    v_group_key
  );
end;
$$;
