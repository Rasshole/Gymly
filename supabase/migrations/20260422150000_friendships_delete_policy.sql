-- Bruger må fjerne venskab (DELETE række hvor de er user_a eller user_b)
drop policy if exists "friendships_delete_member" on public.friendships;
create policy "friendships_delete_member"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);
