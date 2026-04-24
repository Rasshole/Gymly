-- Venneaccept: SECURITY INVOKER + CTE kan fejle under RLS (0 rækker opdateret → "division by zero" i klienten).
-- Denne version kører som definer, validerer stadig auth.uid() mod modtager, og omgår RLS sikkert.

create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid;
  v_to uuid;
  v_status text;
begin
  select r.from_user_id, r.to_user_id, r.status
  into v_from, v_to, v_status
  from public.friend_requests r
  where r.id = p_request_id;

  if v_from is null then
    raise exception 'FRIEND_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status is distinct from 'pending' then
    raise exception 'FRIEND_REQUEST_NOT_PENDING' using errcode = 'P0001';
  end if;

  if v_to is distinct from auth.uid() then
    raise exception 'FRIEND_REQUEST_NOT_RECIPIENT' using errcode = 'P0001';
  end if;

  update public.friend_requests
  set status = 'accepted'
  where id = p_request_id;

  insert into public.friendships (user_a, user_b)
  values (least(v_from, v_to), greatest(v_from, v_to))
  on conflict do nothing;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;
