-- BrewOS private menu-item cost data and photo storage.
-- Apply after 0001_initial_schema.sql. Safe to re-run on an existing project.

create table if not exists public.menu_item_costs (
  menu_item_id uuid primary key references public.menu_items(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  cost_price_paise integer not null check (cost_price_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_item_costs
  add column if not exists created_at timestamptz not null default now();

create index if not exists menu_item_costs_cafe_idx
  on public.menu_item_costs(cafe_id);

alter table public.menu_item_costs enable row level security;
revoke all on public.menu_item_costs from anon;
grant select, insert, update, delete on public.menu_item_costs to authenticated;

drop policy if exists "Cafe owners manage private menu costs" on public.menu_item_costs;
drop policy if exists "menu_item_costs_owner_delete" on public.menu_item_costs;
drop policy if exists "menu_item_costs_owner_insert" on public.menu_item_costs;
drop policy if exists "menu_item_costs_owner_select" on public.menu_item_costs;
drop policy if exists "menu_item_costs_owner_update" on public.menu_item_costs;
create policy "Cafe owners manage private menu costs"
  on public.menu_item_costs
  for all
  to authenticated
  using (
    public.has_cafe_role(
      cafe_id,
      array['owner']::public.cafe_role[]
    )
  )
  with check (
    public.has_cafe_role(
      cafe_id,
      array['owner']::public.cafe_role[]
    )
    and exists (
      select 1
      from public.menu_items item
      where item.id = menu_item_costs.menu_item_id
        and item.cafe_id = menu_item_costs.cafe_id
    )
  );

-- Public URLs are used for menu photos; upload/change/delete is restricted
-- to active owners of the cafe whose UUID is the first path segment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-item-images',
  'menu-item-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read BrewOS menu images" on storage.objects;
drop policy if exists "Cafe managers upload BrewOS menu images" on storage.objects;
drop policy if exists "Cafe managers update BrewOS menu images" on storage.objects;
drop policy if exists "Cafe managers delete BrewOS menu images" on storage.objects;
drop policy if exists "menu_item_images_owner_delete" on storage.objects;
drop policy if exists "menu_item_images_owner_update" on storage.objects;
drop policy if exists "menu_item_images_owner_upload" on storage.objects;
drop policy if exists "menu_item_images_public_read" on storage.objects;
create policy "Public read BrewOS menu images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'menu-item-images');

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
