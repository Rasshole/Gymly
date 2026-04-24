-- Venner kan læse hinandens check_ins (til Aktive nu, kort, notifikationer).
-- Aggregeret tælling pr. center uden at eksponere andres rækker.
-- Realtime på check_ins (venners INSERT → in-app notifikation hos venner).

drop policy if exists "check_ins_select_own" on public.check_ins;

create policy "check_ins_select_own_or_friends"
  on public.check_ins for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_a = auth.uid() and f.user_b = check_ins.user_id)
         or (f.user_b = auth.uid() and f.user_a = check_ins.user_id)
    )
  );

-- Én SQL-sætning (Supabase SQL Editor-kompatibel)
create or replace function public.gym_active_user_totals(p_hours integer default 3)
returns table (gym_id text, user_count bigint)
language sql
security definer
set search_path = public
as $$
  select l.gym_id::text, count(*)::bigint
  from (
    select distinct on (c.user_id) c.user_id, c.gym_id
    from public.check_ins c
    where c.created_at > now() - (p_hours * interval '1 hour')
    order by c.user_id, c.created_at desc
  ) l
  group by l.gym_id
$$;

grant execute on function public.gym_active_user_totals(integer) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'check_ins'
  ) then
    alter publication supabase_realtime add table public.check_ins;
  end if;
exception
  when undefined_object then
    null;
end $$;
