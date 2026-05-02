-- friend_checked_in: tilføj startedAt i data så app kan vise "X min i gang"
create or replace function public.trg_notify_friends_on_check_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  fid uuid;
  friend_name text;
  muscles text[];
  started text;
begin
  started := coalesce(new.started_at, new.created_at, now())::text;
  for fid in select * from public.friend_user_ids(new.user_id) loop
    if not public.are_friends(new.user_id, fid) then
      continue;
    end if;
    if exists (
      select 1 from public.notifications n
      where n.user_id = fid
        and n.type = 'friend_checked_in'
        and n.data->>'checkInId' = new.id::text
    ) then
      continue;
    end if;
    select coalesce((
      select coalesce(p.display_name, p.username) from public.profiles p
      where p.id = new.user_id
    ), 'En ven') into friend_name;
    muscles := case
      when new.workout_type is null or trim(new.workout_type) = '' then array[]::text[]
      else string_to_array(new.workout_type, ',')
    end;
    insert into public.notifications (user_id, actor_user_id, type, title, body, data)
    values (
      fid,
      new.user_id,
      'friend_checked_in',
      format('%s tjekkede ind', friend_name),
      format('%s er tjekket ind i %s', friend_name, new.gym_name) ||
        case
          when new.workout_type is not null and trim(new.workout_type) <> ''
          then E'\n' || 'Træner: ' || new.workout_type
          else ''
        end,
      jsonb_build_object(
        'checkInId', new.id::text,
        'friendUserId', new.user_id::text,
        'centerId', new.gym_id,
        'centerName', new.gym_name,
        'muscleGroups', to_jsonb(muscles),
        'startedAt', started
      )
    );
  end loop;
  return new;
end;
$f$;
