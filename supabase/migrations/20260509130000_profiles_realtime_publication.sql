-- Tillad realtime på profiles (fx favorite_gym_ids), så åbne profilvisninger kan opdatere uden genstart.
-- RLS for profiles gælder stadig for select.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
