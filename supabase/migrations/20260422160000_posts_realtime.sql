-- Realtime for workout-feed (public.posts) så hjemskærmen opdaterer ved nye opslag
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
exception
  when undefined_object then
    null;
end $$;
