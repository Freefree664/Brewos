-- Rivantoq pre-launch hardening: constrain direct order writes to café managers,
-- and ensure order-item inserts cannot attach data across café or branch boundaries.
-- Apply to the live Supabase project only after reviewing and approving this migration.

begin;

drop policy if exists "Staff update orders" on public.orders;
drop policy if exists "Owners and managers update orders" on public.orders;
drop policy if exists "Staff create orders" on public.orders;
drop policy if exists "Owners and managers create POS orders" on public.orders;

create policy "Owners and managers create POS orders"
on public.orders
for insert
to authenticated
with check (
  public.has_cafe_role(
    cafe_id,
    array['owner'::public.cafe_role, 'manager'::public.cafe_role]
  )
);

create policy "Owners and managers update orders"
on public.orders
for update
to authenticated
using (
  public.has_cafe_role(
    cafe_id,
    array['owner'::public.cafe_role, 'manager'::public.cafe_role]
  )
)
with check (
  public.has_cafe_role(
    cafe_id,
    array['owner'::public.cafe_role, 'manager'::public.cafe_role]
  )
);

-- Order-item snapshots are created by the POS and guest-order routines. Keep
-- POS inserts restricted to owners/managers and verify all related records
-- belong to the same café and branch. Historical snapshots are immutable.
drop policy if exists "Managers update order items" on public.order_items;
drop policy if exists "Staff add order items" on public.order_items;
drop policy if exists "Staff add order items within cafe orders" on public.order_items;
drop policy if exists "Owners and managers add order items within cafe orders" on public.order_items;

create policy "Owners and managers add order items within cafe orders"
on public.order_items
for insert
to authenticated
with check (
  public.has_cafe_role(
    cafe_id,
    array['owner'::public.cafe_role, 'manager'::public.cafe_role]
  )
  and exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.cafe_id = order_items.cafe_id
      and (
        order_items.menu_item_id is null
        or exists (
          select 1
          from public.menu_items m
          where m.id = order_items.menu_item_id
            and m.cafe_id = order_items.cafe_id
            and (m.branch_id is null or m.branch_id = o.branch_id)
        )
      )
  )
);

-- Keep the owner/manager POS RPC, but reject new payment records for closed orders.
create or replace function public.record_pos_payment(
  p_order_id uuid,
  p_method text,
  p_amount_paise integer,
  p_reference text default null
)
returns table(payment_id uuid, paid_paise bigint, due_paise bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
  v_paid bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required.';
  end if;

  if p_method not in ('cash', 'card', 'upi') then
    raise exception 'Choose cash, card or UPI.';
  end if;

  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Enter a payment amount greater than zero.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if not public.has_cafe_role(
    v_order.cafe_id,
    array['owner'::public.cafe_role, 'manager'::public.cafe_role]
  ) then
    raise exception 'Only café owners and managers can record payments.';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'This order is already closed.';
  end if;

  select coalesce(sum(amount_paise), 0)
  into v_paid
  from public.order_payments
  where order_id = p_order_id;

  if v_paid + p_amount_paise > v_order.total_paise then
    raise exception 'Payment exceeds the remaining balance.';
  end if;

  insert into public.order_payments(
    order_id, cafe_id, amount_paise, method, reference, recorded_by
  )
  values (
    p_order_id,
    v_order.cafe_id,
    p_amount_paise,
    p_method,
    nullif(left(trim(coalesce(p_reference, '')), 100), ''),
    (select auth.uid())
  )
  returning id into payment_id;

  paid_paise := v_paid + p_amount_paise;
  due_paise := v_order.total_paise - paid_paise;
  return next;
end;
$function$;

commit;
