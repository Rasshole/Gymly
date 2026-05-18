-- Reliable checkout when client PATCH fails (optional columns / RLS edge cases).

create or replace function public.complete_my_active_check_in(p_check_in_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
  v_row public.check_ins%rowtype;
  v_ended timestamptz := now();
  v_mins integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_check_in_id is not null then
    select * into v_row
    from public.check_ins c
    where c.id = p_check_in_id and c.user_id = v_uid
    limit 1;
  else
    select * into v_row
    from public.check_ins c
    where c.user_id = v_uid
      and c.is_active is not false
      and c.ended_at is null
    order by c.started_at desc nulls last
    limit 1;
  end if;

  if v_row.id is null then
    raise exception 'No active check-in found';
  end if;

  if v_row.ended_at is not null then
    v_mins := greatest(
      1,
      round(extract(epoch from (v_row.ended_at - v_row.started_at)) / 60.0)::integer
    );
    return json_build_object(
      'id', v_row.id,
      'gym_id', v_row.gym_id,
      'gym_name', v_row.gym_name,
      'workout_type', v_row.workout_type,
      'started_at', v_row.started_at,
      'ended_at', v_row.ended_at,
      'duration_minutes', v_mins,
      'is_active', false
    );
  end if;

  v_mins := greatest(
    1,
    round(extract(epoch from (v_ended - v_row.started_at)) / 60.0)::integer
  );

  update public.check_ins c
  set
    is_active = false,
    ended_at = v_ended,
    end_reason = coalesce(c.end_reason, 'user')
  where c.id = v_row.id and c.user_id = v_uid;

  return json_build_object(
    'id', v_row.id,
    'gym_id', v_row.gym_id,
    'gym_name', v_row.gym_name,
    'workout_type', v_row.workout_type,
    'started_at', v_row.started_at,
    'ended_at', v_ended,
    'duration_minutes', v_mins,
    'is_active', false
  );
end;
$f$;

revoke all on function public.complete_my_active_check_in(uuid) from public;
grant execute on function public.complete_my_active_check_in(uuid) to authenticated;
