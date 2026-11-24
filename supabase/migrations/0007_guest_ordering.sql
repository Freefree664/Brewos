-- Secure guest ordering for BrewOS.
-- A QR identifies a table; a short-lived staff-issued PIN authorizes one order.

create table if not exists public.table_order_pins (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.dining_tables(id) on delete cascade,
  pin_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists table_order_pins_lookup_idx
  on public.table_order_pins(table_id, created_at desc);

alter table public.table_order_pins enable row level security;
revoke all on public.table_order_pins from anon, authenticated;

create or replace function public.issue_table_order_pin(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table public.dining_tables%rowtype;
  v_pin text;
  v_random bytea;
begin
  if auth.uid() is null then raise exception 'Please sign in as café staff.'; end if;

  select * into v_table
  from public.dining_tables
  where id = p_table_id and active = true
  for update;

  if not found then raise exception 'Active table not found.'; end if;
  if not public.has_cafe_role(v_table.cafe_id, array['owner','manager','waiter']::public.cafe_role[]) then
    raise exception 'You do not have permission to issue an order PIN.';
  end if;

  v_random := extensions.gen_random_bytes(4);
  v_pin := lpad(((get_byte(v_random,0)::bigint * 16777216 + get_byte(v_random,1)::bigint * 65536 + get_byte(v_random,2)::bigint * 256 + get_byte(v_random,3)::bigint) % 1000000)::text, 6, '0');

  update public.table_order_pins
  set consumed_at = now()
  where table_id = p_table_id and consumed_at is null;

  insert into public.table_order_pins(table_id, pin_hash, expires_at, created_by)
  values (
    p_table_id,
    encode(extensions.digest(v_pin, 'sha256'), 'hex'),
    now() + interval '10 minutes',
    auth.uid()
  );

  return jsonb_build_object('pin', v_pin, 'expires_in_seconds', 600);
end;
$$;

create or replace function public.submit_guest_order(
  p_token text,
  p_pin text,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table public.dining_tables%rowtype;
  v_pin_row public.table_order_pins%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_qty integer;
  v_subtotal integer := 0;
  v_count integer := 0;
begin
  if coalesce(length(p_token), 0) < 32 then raise exception 'Invalid table QR.'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{6} raise exception 'Enter the 6-digit PIN from café staff.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Your cart must contain 1 to 30 item lines.';
  end if;

  select * into v_table
  from public.dining_tables
  where qr_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and active = true;

  if not found then raise exception 'This table QR is invalid or inactive.'; end if;

  select * into v_pin_row
  from public.table_order_pins
  where table_id = v_table.id
    and consumed_at is null
    and expires_at > now()
    and attempts < 5
  order by created_at desc
  limit 1
  for update;

  if not found then raise exception 'Ask café staff for a new order PIN.'; end if;

  if v_pin_row.pin_hash <> encode(extensions.digest(p_pin, 'sha256'), 'hex') then
    update public.table_order_pins
    set attempts = attempts + 1,
        consumed_at = case when attempts + 1 >= 5 then now() else consumed_at end
    where id = v_pin_row.id;
    return jsonb_build_object('error', 'Incorrect PIN. Please check with café staff.');
  end if;

  -- Consume the PIN before creating the order. The transaction is atomic.
  update public.table_order_pins set consumed_at = now() where id = v_pin_row.id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_count := v_count + 1;
    if coalesce(v_item->>'menu_item_id','') = '' then raise exception 'Invalid cart item.'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 20 then raise exception 'Item quantity must be between 1 and 20.'; end if;

    select * into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and cafe_id = v_table.cafe_id
      and is_available = true
      and (branch_id is null or branch_id = v_table.branch_id);

    if not found then raise exception 'An item is unavailable. Refresh the menu and try again.'; end if;
    v_subtotal := v_subtotal + (v_menu_item.price_paise * v_qty);
  end loop;

  insert into public.orders(
    cafe_id, branch_id, table_id, order_type, status,
    notes, subtotal_paise, tax_paise, total_paise
  ) values (
    v_table.cafe_id, v_table.branch_id, v_table.id, 'dine_in', 'pending',
    left(coalesce(p_notes, ''), 500), v_subtotal, 0, v_subtotal
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and cafe_id = v_table.cafe_id
      and is_available = true
      and (branch_id is null or branch_id = v_table.branch_id);

    insert into public.order_items(
      order_id, cafe_id, menu_item_id, item_name_snapshot,
      quantity, unit_price_paise, line_total_paise
    ) values (
      v_order_id, v_table.cafe_id, v_menu_item.id, v_menu_item.name,
      v_qty, v_menu_item.price_paise, v_menu_item.price_paise * v_qty
    );
  end loop;

  return jsonb_build_object('order_id', v_order_id, 'status', 'pending', 'total_paise', v_subtotal);
end;
$$;

revoke all on function public.issue_table_order_pin(uuid) from public, anon;
grant execute on function public.issue_table_order_pin(uuid) to authenticated;
revoke all on function public.submit_guest_order(text, text, jsonb, text) from public;
grant execute on function public.submit_guest_order(text, text, jsonb, text) to anon, authenticated;
 then raise exception 'Enter the 6-digit PIN from café staff.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Your cart must contain 1 to 30 item lines.';
  end if;

  select * into v_table
  from public.dining_tables
  where qr_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and active = true;

  if not found then raise exception 'This table QR is invalid or inactive.'; end if;

  select * into v_pin_row
  from public.table_order_pins
  where table_id = v_table.id
    and consumed_at is null
    and expires_at > now()
    and attempts < 5
  order by created_at desc
  limit 1
  for update;

  if not found then raise exception 'Ask café staff for a new order PIN.'; end if;

  if v_pin_row.pin_hash <> encode(extensions.digest(p_pin, 'sha256'), 'hex') then
    update public.table_order_pins
    set attempts = attempts + 1,
        consumed_at = case when attempts + 1 >= 5 then now() else consumed_at end
    where id = v_pin_row.id;
    raise exception 'Incorrect PIN. Please check with café staff.';
  end if;

  -- Consume the PIN before creating the order. The transaction is atomic.
  update public.table_order_pins set consumed_at = now() where id = v_pin_row.id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_count := v_count + 1;
    if coalesce(v_item->>'menu_item_id','') = '' then raise exception 'Invalid cart item.'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 20 then raise exception 'Item quantity must be between 1 and 20.'; end if;

    select * into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and cafe_id = v_table.cafe_id
      and is_available = true
      and (branch_id is null or branch_id = v_table.branch_id);

    if not found then raise exception 'An item is unavailable. Refresh the menu and try again.'; end if;
    v_subtotal := v_subtotal + (v_menu_item.price_paise * v_qty);
  end loop;

  insert into public.orders(
    cafe_id, branch_id, table_id, order_type, status,
    notes, subtotal_paise, tax_paise, total_paise
  ) values (
    v_table.cafe_id, v_table.branch_id, v_table.id, 'dine_in', 'pending',
    left(coalesce(p_notes, ''), 500), v_subtotal, 0, v_subtotal
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and cafe_id = v_table.cafe_id
      and is_available = true
      and (branch_id is null or branch_id = v_table.branch_id);

    insert into public.order_items(
      order_id, cafe_id, menu_item_id, item_name_snapshot,
      quantity, unit_price_paise, line_total_paise
    ) values (
      v_order_id, v_table.cafe_id, v_menu_item.id, v_menu_item.name,
      v_qty, v_menu_item.price_paise, v_menu_item.price_paise * v_qty
    );
  end loop;

  return jsonb_build_object('order_id', v_order_id, 'status', 'pending', 'total_paise', v_subtotal);
end;
$$;

revoke all on function public.issue_table_order_pin(uuid) from public, anon;
grant execute on function public.issue_table_order_pin(uuid) to authenticated;
revoke all on function public.submit_guest_order(text, text, jsonb, text) from public;
grant execute on function public.submit_guest_order(text, text, jsonb, text) to anon, authenticated;
