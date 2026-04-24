-- Lokale centre (max 3 gym-ID’er) synlige på egen/andres profil
alter table public.profiles
  add column if not exists favorite_gym_ids integer[] not null default '{}';
