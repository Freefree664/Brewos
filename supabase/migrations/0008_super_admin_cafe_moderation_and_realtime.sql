-- BrewOS Super Admin restaurant moderation and order notification Realtime.
-- Apply after 0007_guest_ordering.sql.

create or replace function public.admin_list_pending_cafes()
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  contact_phone text,
  created_by uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.slug,
    c.description,
    c.contact_phone,
    c.created_by,
    c.created_at
  from public.cafes as c
  where c.status = 'pending'
    and public.is_super_admin()
  order by c.created_at asc;
$$;

revoke all on function public.admin_list_pending_cafes() from public, anon;
grant execute on function public.admin_list_pending_cafes() to authenticated;

create or replace function public.admin_review_cafe(
  p_cafe_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized to review restaurants';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  update public.cafes
  set status = p_decision,
      updated_at = now()
  where id = p_cafe_id
    and status = 'pending';

  if not found then
    raise exception 'Pending restaurant not found or already reviewed';
  end if;
end;
$$;

revoke all on function public.admin_review_cafe(uuid, text) from public, anon;
grant execute on function public.admin_review_cafe(uuid, text) to authenticated;

-- The OwnerOrders screen also polls every 15 seconds, so orders remain visible
-- if Realtime is unavailable. Add orders to the publication when it exists.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
