alter table public.order_items
  add column if not exists unit_cost_paise integer;

comment on column public.order_items.unit_cost_paise is
  'Preparation cost per unit captured when the order is created; NULL means no cost was configured at that time.';

create or replace function public.create_pos_order_v2(
  p_cafe_id uuid,
  p_branch_id uuid,
  p_order_type public.order_type,
  p_customer_name text,
  p_notes text,
  p_items jsonb,
  p_discount_paise integer,
  p_customer_phone text
)
returns table(order_id uuid, order_number bigint, subtotal_paise integer, discount_paise integer, total_paise integer)
language plpgsql
set search_path to ''
as $function$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal bigint := 0;
  v_item_count integer;
  v_matched_count integer;
  v_discount integer;
begin
  if (select auth.uid()) is null then raise exception 'Sign in is required.'; end if;
  if not public.has_cafe_role(p_cafe_id,array['owner'::public.cafe_role,'manager'::public.cafe_role]) then
    raise exception 'Only café owners and managers can create bills.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then
    raise exception 'Add between 1 and 50 menu items.';
  end if;
  if p_discount_paise is null or p_discount_paise<0 then raise exception 'Discount cannot be negative.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity integer) where x.menu_item_id is null or x.quantity is null or x.quantity<1 or x.quantity>99) then
    raise exception 'Each item needs a valid menu item and quantity between 1 and 99.';
  end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.cafe_id=p_cafe_id and b.active=true) then
    raise exception 'Choose an active branch.';
  end if;
  select count(distinct x.menu_item_id),count(distinct mi.id),coalesce(sum(mi.price_paise::bigint*x.quantity),0)
  into v_item_count,v_matched_count,v_subtotal
  from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity integer)
  left join public.menu_items mi on mi.id=x.menu_item_id and mi.cafe_id=p_cafe_id and (mi.branch_id is null or mi.branch_id=p_branch_id) and mi.is_available=true;
  if v_item_count<>v_matched_count then raise exception 'One or more items are unavailable. Refresh the menu.'; end if;
  if v_subtotal>2147483647 or p_discount_paise>v_subtotal then raise exception 'Discount cannot exceed the bill subtotal.'; end if;
  v_discount:=p_discount_paise;
  insert into public.orders(cafe_id,branch_id,order_type,status,customer_name,customer_phone,notes,subtotal_paise,discount_paise,tax_paise,total_paise,created_by)
  values(p_cafe_id,p_branch_id,p_order_type,'pending',nullif(left(trim(coalesce(p_customer_name,'')),100),''),nullif(left(trim(coalesce(p_customer_phone,'')),20),''),nullif(left(trim(coalesce(p_notes,'')),500),''),v_subtotal::integer,v_discount,0,(v_subtotal-v_discount)::integer,(select auth.uid()))
  returning id,orders.order_number into v_order_id,v_order_number;
  insert into public.order_items(order_id,cafe_id,menu_item_id,item_name_snapshot,quantity,unit_price_paise,unit_cost_paise,line_total_paise)
  select v_order_id,p_cafe_id,mi.id,mi.name,sum(x.quantity)::integer,mi.price_paise,c.cost_price_paise,(sum(x.quantity)::bigint*mi.price_paise)::integer
  from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity integer)
  join public.menu_items mi on mi.id=x.menu_item_id and mi.cafe_id=p_cafe_id and (mi.branch_id is null or mi.branch_id=p_branch_id) and mi.is_available=true
  left join public.menu_item_costs c on c.menu_item_id=mi.id and c.cafe_id=p_cafe_id
  group by mi.id,mi.name,mi.price_paise,c.cost_price_paise;
  return query select v_order_id,v_order_number,v_subtotal::integer,v_discount,(v_subtotal-v_discount)::integer;
end;
$function$;

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
  v_cost integer;
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
    select c.cost_price_paise into v_cost from public.menu_item_costs c
      where c.menu_item_id=v_menu_item.id and c.cafe_id=v_table.cafe_id;
    insert into public.order_items(order_id,cafe_id,menu_item_id,item_name_snapshot,quantity,unit_price_paise,unit_cost_paise,line_total_paise)
    values(v_order_id,v_table.cafe_id,v_menu_item.id,v_menu_item.name,v_qty,v_menu_item.price_paise,v_cost,v_menu_item.price_paise*v_qty);
  end loop;
  return jsonb_build_object('order_id',v_order_id,'status','pending','total_paise',v_subtotal);
end;
$function$;

revoke execute on function public.create_pos_order_v2(uuid,uuid,public.order_type,text,text,jsonb,integer) from public, anon, authenticated;
