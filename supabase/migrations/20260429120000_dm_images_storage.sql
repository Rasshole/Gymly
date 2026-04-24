-- Public DM image bucket: paths must start with auth.uid() for uploads (see policies).
insert into storage.buckets (id, name, public)
values ('dm-images', 'dm-images', true)
on conflict (id) do update
set
  public = excluded.public;

drop policy if exists "dm_images_insert_own" on storage.objects;
drop policy if exists "dm_images_select_public" on storage.objects;
drop policy if exists "dm_images_update_own" on storage.objects;
drop policy if exists "dm_images_delete_own" on storage.objects;

create policy "dm_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dm-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

-- URLs are embedded in DMs; paths are unguessable (uid/thread/timestamp).
create policy "dm_images_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'dm-images');

create policy "dm_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dm-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );

create policy "dm_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dm-images'
    and (storage.foldername (name))[1] = auth.uid()::text
  );
