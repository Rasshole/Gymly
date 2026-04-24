-- Begge parter i en venneanmodning må slette (oprydning ved unfriend, alternativ afvisning)
drop policy if exists "fr_delete_sender" on public.friend_requests;
create policy "fr_delete_participant"
  on public.friend_requests for delete
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Realtime: når venskab indsættes/slettes, kan klienten opdatere venneliste
do $r$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
exception
  when undefined_object then
    null;
end $r$;

do $r$
begin
  if to_regclass('public.friendships') is not null then
    execute 'alter table public.friendships replica identity full';
  end if;
end $r$;
