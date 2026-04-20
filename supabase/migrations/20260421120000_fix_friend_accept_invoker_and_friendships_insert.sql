-- Ret venneaccept under Supabase RLS: DEFINER kunne ikke INSERT i friendships uden policy.
-- Kør i SQL Editor (én gang) hvis du allerede har kørt den gamle migration med security definer.

drop policy if exists "friendships_insert_members" on public.friendships;
create policy "friendships_insert_members"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);

create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = public
as $sql$
with updated as (
  update public.friend_requests r
  set status = 'accepted'
  where r.id = p_request_id
    and r.to_user_id = auth.uid()
    and r.status = 'pending'
  returning r.from_user_id, r.to_user_id
),
ins as (
  insert into public.friendships (user_a, user_b)
  select
    least(u.from_user_id, u.to_user_id),
    greatest(u.from_user_id, u.to_user_id)
  from updated u
  on conflict do nothing
  returning 1
),
guard as (
  select
    exists (
      select 1
      from public.friend_requests
      where id = p_request_id
    ) as exists_id,
    exists (select 1 from updated) as did_update
)
select
  case
    when not guard.exists_id then 1 / 0
    when not guard.did_update then 1 / 0
    else coalesce((select 1 from ins limit 1), 1)
  end
from guard
$sql$;

create or replace function public.decline_friend_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = public
as $sql$
update public.friend_requests
set status = 'declined'
where id = p_request_id
  and to_user_id = auth.uid()
  and status = 'pending'
$sql$;

grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
