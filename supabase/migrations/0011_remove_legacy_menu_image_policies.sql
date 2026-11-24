-- Ensure the public menu-photo bucket remains readable while only active café
-- owners can upload, replace, or delete objects under their café UUID folder.
drop policy if exists "Cafe managers upload BrewOS menu images" on storage.objects;
drop policy if exists "Cafe managers update BrewOS menu images" on storage.objects;
drop policy if exists "Cafe managers delete BrewOS menu images" on storage.objects;

drop policy if exists "Cafe owners upload BrewOS menu images" on storage.objects;
create policy "Cafe owners upload BrewOS menu images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'menu-item-images'
    and exists (
      select 1
      from public.cafe_memberships membership
      where membership.cafe_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.active = true
        and membership.role = 'owner'
    )
  );

drop policy if exists "Cafe owners update BrewOS menu images" on storage.objects;
create policy "Cafe owners update BrewOS menu images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'menu-item-images'
    and exists (
      select 1
      from public.cafe_memberships membership
      where membership.cafe_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.active = true
        and membership.role = 'owner'
    )
  )
  with check (
    bucket_id = 'menu-item-images'
    and exists (
      select 1
      from public.cafe_memberships membership
      where membership.cafe_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.active = true
        and membership.role = 'owner'
    )
  );

drop policy if exists "Cafe owners delete BrewOS menu images" on storage.objects;
create policy "Cafe owners delete BrewOS menu images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'menu-item-images'
    and exists (
      select 1
      from public.cafe_memberships membership
      where membership.cafe_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.active = true
        and membership.role = 'owner'
    )
  );
