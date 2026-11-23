-- BrewOS initial database foundation for Supabase (PostgreSQL)
-- Apply in a NEW Supabase project after reviewing the schema.
-- Tenant access is scoped through cafe_memberships; never expose service_role keys in the browser.

create extension if not exists pgcrypto;

create type public.cafe_role as enum ('owner', 'manager', 'waiter', 'kitchen');
create type public.order_type as enum ('dine_in', 'takeaway', 'delivery');
create type public.order_status as enum ('pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  preferred_language text not null default 'en' check (preferred_language in ('en','hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cafes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  contact_email text,
  contact_phone text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cafe_memberships (
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.cafe_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (cafe_id, user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, cafe_id)
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  branch_id uuid,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (branch_id, cafe_id) references public.branches(id, cafe_id) on delete cascade
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  branch_id uuid,
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  price_paise integer not null check (price_paise >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, cafe_id) references public.branches(id, cafe_id) on delete cascade
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  branch_id uuid not null,
  table_name text not null,
  qr_token_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (branch_id, cafe_id) references public.branches(id, cafe_id) on delete cascade,
  unique (branch_id, table_name)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  branch_id uuid not null,
  table_id uuid,
  order_number bigint generated always as identity,
  order_type public.order_type not null,
  status public.order_status not null default 'pending',
  customer_name text,
  customer_phone text,
  notes text,
  subtotal_paise integer not null default 0 check (subtotal_paise >= 0),
  tax_paise integer not null default 0 check (tax_paise >= 0),
  total_paise integer not null default 0 check (total_paise >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, cafe_id) references public.branches(id, cafe_id) on delete cascade,
  foreign key (table_id) references public.dining_tables(id) on delete set null
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  line_total_paise integer not null check (line_total_paise >= 0),
  customizations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index cafe_memberships_user_idx on public.cafe_memberships(user_id, active);
create index branches_cafe_idx on public.branches(cafe_id);
create index menu_items_cafe_branch_idx on public.menu_items(cafe_id, branch_id, is_available);
create index orders_cafe_branch_created_idx on public.orders(cafe_id, branch_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);

-- Security-definer helper avoids recursive membership-policy evaluation.
create or replace function public.is_cafe_member(target_cafe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cafe_memberships m
    where m.cafe_id = target_cafe
      and m.user_id = (select auth.uid())
      and m.active = true
  );
$$;

create or replace function public.has_cafe_role(target_cafe uuid, allowed_roles public.cafe_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cafe_memberships m
    where m.cafe_id = target_cafe
      and m.user_id = (select auth.uid())
      and m.active = true
      and m.role = any(allowed_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.cafes enable row level security;
alter table public.cafe_memberships enable row level security;
alter table public.branches enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.dining_tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Users read own profile" on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy "Users create own profile" on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
create policy "Users update own profile" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Members read their cafes" on public.cafes
for select to authenticated using (public.is_cafe_member(id) or created_by = (select auth.uid()));
create policy "Authenticated users submit cafes" on public.cafes
for insert to authenticated with check (created_by = (select auth.uid()));
create policy "Owners update their cafes" on public.cafes
for update to authenticated using (public.has_cafe_role(id, array['owner']::public.cafe_role[]))
with check (public.has_cafe_role(id, array['owner']::public.cafe_role[]));

create policy "Members read memberships" on public.cafe_memberships
for select to authenticated using (public.is_cafe_member(cafe_id) or user_id = (select auth.uid()));
create policy "Owners manage memberships" on public.cafe_memberships
for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner']::public.cafe_role[]));

create policy "Members read branches" on public.branches
for select to authenticated using (public.is_cafe_member(cafe_id));
create policy "Managers manage branches" on public.branches
for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create policy "Members read menu categories" on public.menu_categories
for select to authenticated using (public.is_cafe_member(cafe_id));
create policy "Managers manage menu categories" on public.menu_categories
for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create policy "Members read menu items" on public.menu_items
for select to authenticated using (public.is_cafe_member(cafe_id));
create policy "Managers manage menu items" on public.menu_items
for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create policy "Members read dining tables" on public.dining_tables
for select to authenticated using (public.is_cafe_member(cafe_id));
create policy "Managers manage dining tables" on public.dining_tables
for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create policy "Members read orders" on public.orders
for select to authenticated using (public.is_cafe_member(cafe_id));
create policy "Staff create orders" on public.orders
for insert to authenticated
with check (public.has_cafe_role(cafe_id, array['owner','manager','waiter']::public.cafe_role[]));
create policy "Staff update orders" on public.orders
for update to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager','waiter','kitchen']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager','waiter','kitchen']::public.cafe_role[]));

create policy "Members read order items" on public.order_items
for select to authenticated using (public.is_cafe_member(cafe_id));
create policy "Staff add order items" on public.order_items
for insert to authenticated
with check (public.has_cafe_role(cafe_id, array['owner','manager','waiter']::public.cafe_role[]));
create policy "Managers update order items" on public.order_items
for update to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

-- Public guest QR ordering is intentionally NOT enabled by these policies.
-- It must be implemented later with server-side validation of waiter-issued,
-- short-lived table PINs; a static QR token alone must never authorize an order.
