-- Fix infinite RLS recursion on planned_workout_participants (policy queried same table).
-- Membership check runs in SECURITY DEFINER so it does not re-enter RLS.

create or replace function public.is_planned_workout_member(p_workout_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.planned_workout_participants p
    where p.planned_workout_id = p_workout_id
      and p.user_id = p_user_id
  );
$$;

revoke all on function public.is_planned_workout_member(uuid, uuid) from public;
grant execute on function public.is_planned_workout_member(uuid, uuid) to authenticated;

-- Participants: se egne rækker + alle rækker for workouts man deltager i (én forespørgsel uden rekursion)
drop policy if exists "planned_workout_participants_select_participant" on public.planned_workout_participants;
create policy "planned_workout_participants_select_member"
  on public.planned_workout_participants for select
  to authenticated
  using (public.is_planned_workout_member(planned_workout_id, auth.uid()));

-- Opret/opdater: deltager egen række, eller opretter lægger andre ind (typisk via RPC, men sikker for direkte klient hvis nødvendigt)
drop policy if exists "planned_workout_participants_insert" on public.planned_workout_participants;
create policy "planned_workout_participants_insert"
  on public.planned_workout_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.planned_workouts pw
      where pw.id = planned_workout_participants.planned_workout_id
        and pw.creator_user_id = auth.uid()
    )
  );

drop policy if exists "planned_workout_participants_update" on public.planned_workout_participants;
create policy "planned_workout_participants_update_own"
  on public.planned_workout_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- planned_workouts: undgå at SELECT-politik skal evaluere den gamle deltager-subforespørgsel før deltager-RLS er rettet
drop policy if exists "planned_workouts_select_participant" on public.planned_workouts;
create policy "planned_workouts_select_participant"
  on public.planned_workouts for select
  to authenticated
  using (
    creator_user_id = auth.uid()
    or public.is_planned_workout_member(id, auth.uid())
  );
