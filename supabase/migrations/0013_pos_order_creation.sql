-- Atomic cashier order creation for BrewOS POS.
-- SECURITY INVOKER keeps the existing cafe membership RLS policies in force.
create or replace function public.create_pos_order(
  p_cafe_id uuid,
  p_branch_id uuid,
  p_order_type public.order_type,
  p_customer_name text,
  p_notes text,
  p_items jsonb
)
returns table(order_id uuid, order_number bigint, subtotal_paise integer, total_paise integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal bigint := 0;
  v_item_count integer;
  v_matched_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required to create a cashier order.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Add between 1 and 50 menu items.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity integer)
    where x.menu_item_id is null or x.quantity is null or x.quantity < 1 or x.quantity > 99
  ) then
    raise exception 'Each item needs a valid menu item and quantity between 1 and 99.';
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.cafe_id = p_cafe_id and b.active = true
  ) then
    raise exception 'Choose an active branch.';
  end if;

  select count(distinct x.menu_item_id), count(distinct mi.id),
         coalesce(sum(mi.price_paise::bigint * x.quantity), 0)
    into v_item_count, v_matched_count, v_subtotal
  from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity integer)
  left join public.menu_items mi
    on mi.id = x.menu_item_id
   and mi.cafe_id = p_cafe_id
   and (mi.branch_id is null or mi.branch_id = p_branch_id)
   and mi.is_available = true;

  if v_item_count <> v_matched_count then
    raise exception 'One or more items are unavailable. Refresh the menu and try again.';
  end if;
  if v_subtotal > 2147483647 then
    raise exception 'Order total is too large.';
  end if;

  insert into public.orders(
    cafe_id, branch_id, order_type, status, customer_name, notes,
    subtotal_paise, tax_paise, total_paise, created_by
  )
  values (
    p_cafe_id, p_branch_id, p_order_type, 'pending',
    nullif(left(trim(coalesce(p_customer_name, '')), 100), ''),
    nullif(left(trim(coalesce(p_notes, '')), 500), ''),
    v_subtotal::integer, 0, v_subtotal::integer, (select auth.uid())
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items(
    order_id, cafe_id, menu_item_id, item_name_snapshot,
    quantity, unit_price_paise, line_total_paise
  )
  select v_order_id, p_cafe_id, mi.id, mi.name,
         sum(x.quantity)::integer, mi.price_paise,
         (sum(x.quantity)::bigint * mi.price_paise)::integer
  from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity integer)
  join public.menu_items mi
    on mi.id = x.menu_item_id
   and mi.cafe_id = p_cafe_id
   and (mi.branch_id is null or mi.branch_id = p_branch_id)
   and mi.is_available = true
  group by mi.id, mi.name, mi.price_paise;

  return query select v_order_id, v_order_number, v_subtotal::integer, v_subtotal::integer;
end;
$$;

revoke all on function public.create_pos_order(uuid, uuid, public.order_type, text, text, jsonb) from public, anon;
grant execute on function public.create_pos_order(uuid, uuid, public.order_type, text, text, jsonb) to authenticated;
