-- Capture optional guest customer details so completed QR orders can earn loyalty points.
create or replace function public.submit_guest_order(
  p_token text,
  p_pin text,
  p_items jsonb,
  p_notes text default null,
  p_customer_name text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_table public.dining_tables%rowtype;
  v_session public.table_order_sessions%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_qty integer;
  v_subtotal integer := 0;
  v_count integer := 0;
  v_phone text;
begin
  if coalesce(length(p_token),0)<32 then raise exception 'Invalid table QR.'; end if;
  if coalesce(p_pin,'') !~ '^[0-9]{6}$' then raise exception 'This table is not open for ordering yet.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then
    raise exception 'Your cart must contain 1 to 30 item lines.';
  end if;
  v_phone := nullif(left(trim(coalesce(p_customer_phone,'')),20),'');
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 -]{5,18}$' then
    raise exception 'Enter a valid mobile number or leave it blank.';
  end if;
  select * into v_table from public.dining_tables
    where qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and active=true;
  if not found then raise exception 'This table QR is invalid or inactive.'; end if;
  select * into v_session from public.table_order_sessions
    where table_id=v_table.id and ended_at is null for update;
  if not found then raise exception 'This table is not open for ordering yet. Please wait for café staff.'; end if;
  if v_session.access_code<>p_pin then raise exception 'The table session code is no longer valid. Please refresh this page.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count:=v_count+1;
    if coalesce(v_item->>'menu_item_id','')='' then raise exception 'Invalid cart item.'; end if;
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty<1 or v_qty>20 then raise exception 'Item quantity must be between 1 and 20.'; end if;
    select * into v_menu_item from public.menu_items
      where id=(v_item->>'menu_item_id')::uuid and cafe_id=v_table.cafe_id
        and is_available=true and (branch_id is null or branch_id=v_table.branch_id);
    if not found then raise exception 'An item is unavailable. Refresh the menu and try again.'; end if;
    v_subtotal:=v_subtotal+(v_menu_item.price_paise*v_qty);
  end loop;
  insert into public.orders(cafe_id,branch_id,table_id,order_type,status,customer_name,customer_phone,notes,subtotal_paise,tax_paise,total_paise)
  values(v_table.cafe_id,v_table.branch_id,v_table.id,'dine_in','pending',nullif(left(trim(coalesce(p_customer_name,'')),100),''),v_phone,left(coalesce(p_notes,''),500),v_subtotal,0,v_subtotal)
  returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::integer;
    select * into v_menu_item from public.menu_items
      where id=(v_item->>'menu_item_id')::uuid and cafe_id=v_table.cafe_id
        and is_available=true and (branch_id is null or branch_id=v_table.branch_id);
    insert into public.order_items(order_id,cafe_id,menu_item_id,item_name_snapshot,quantity,unit_price_paise,line_total_paise)
    values(v_order_id,v_table.cafe_id,v_menu_item.id,v_menu_item.name,v_qty,v_menu_item.price_paise,v_menu_item.price_paise*v_qty);
  end loop;
  return jsonb_build_object('order_id',v_order_id,'status','pending','total_paise',v_subtotal);
end;
$function$;
revoke all on function public.submit_guest_order(text,text,jsonb,text,text,text) from public;
grant execute on function public.submit_guest_order(text,text,jsonb,text,text,text) to anon,authenticated;

create or replace function public.get_guest_order_status(p_token text,p_order_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'order_id',o.id,
    'order_number',o.order_number,
    'status',o.status,
    'updated_at',o.updated_at,
    'subtotal_paise',o.subtotal_paise,
    'discount_paise',coalesce(o.discount_paise,0),
    'tax_paise',o.tax_paise,
    'total_paise',o.total_paise,
    'restaurant_name',c.name,
    'upi_id',c.upi_id,
    'loyalty_points_earned',coalesce((select sum(l.points_delta) from public.customer_loyalty_ledger l where l.order_id=o.id and l.points_delta>0),0),
    'loyalty_points_balance',case when o.status='completed' and o.customer_phone is not null then
      coalesce((select a.points_balance from public.customer_loyalty_accounts a where a.cafe_id=o.cafe_id and a.customer_phone=o.customer_phone),0)
      else 0 end,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',oi.item_name_snapshot,
        'quantity',oi.quantity,
        'unit_price_paise',oi.unit_price_paise,
        'line_total_paise',oi.line_total_paise
      ) order by oi.created_at)
      from public.order_items oi where oi.order_id=o.id
    ),'[]'::jsonb)
  )
  from public.orders o
  join public.dining_tables t on t.id=o.table_id
  join public.cafes c on c.id=o.cafe_id
  where o.id=p_order_id
    and t.qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and t.active=true
  limit 1;
$function$;
