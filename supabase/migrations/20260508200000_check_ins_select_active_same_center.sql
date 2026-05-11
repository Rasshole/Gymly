-- Live i centret: allow authenticated users to read active same-center sessions
-- (not only friends), while preserving full history privacy.

drop policy if exists "check_ins_select_own_or_friends" on public.check_ins;

create policy "check_ins_select_own_or_friends_or_active"
  on public.check_ins for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where (f.user_a = auth.uid() and f.user_b = check_ins.user_id)
         or (f.user_b = auth.uid() and f.user_a = check_ins.user_id)
    )
    or (
      check_ins.is_active = true
      and check_ins.ended_at is null
    )
  );

