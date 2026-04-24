-- Skift favorit-center fra numeriske OSM-id'er til stabile slug-tekst-id'er (centers.json)
alter table public.profiles
  alter column favorite_gym_ids type text[] using '{}'::text[];
