-- Stats/historik: bruger skal altid kunne læse egne afsluttede check_ins (uafhængigt af venner/aktiv-filter).

create or replace function public.get_my_completed_check_ins_for_stats(p_limit integer default 5000)
returns table (
  id uuid,
  gym_name text,
  started_at timestamptz,
  ended_at timestamptz,
  workout_type text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.gym_name,
    c.started_at,
    c.ended_at,
    c.workout_type,
    c.is_active
  from public.check_ins c
  where c.user_id = auth.uid()
    and c.ended_at is not null
    and c.started_at is not null
  order by c.ended_at desc
  limit greatest(1, least(coalesce(p_limit, 5000), 5000));
$$;

revoke all on function public.get_my_completed_check_ins_for_stats(integer) from public;
grant execute on function public.get_my_completed_check_ins_for_stats(integer) to authenticated;
