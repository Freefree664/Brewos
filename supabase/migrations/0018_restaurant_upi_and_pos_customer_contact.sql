-- Per-restaurant UPI details and POS customer contact capture.
alter table public.cafes add column if not exists upi_id text;
alter table public.cafes drop constraint if exists cafes_upi_id_format;
alter table public.cafes add constraint cafes_upi_id_format
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$');

create or replace function public.create_pos_order_v2(
  p_cafe_id uuid, p_branch_id uuid, p_order_type public.order_type,
  p_customer_name text, p_notes text, p_items jsonb,
  p_discount_paise integer, p_customer_phone text
)
returns table(order_id uuid, order_number bigint, subtotal_paise integer, discount_paise integer, total_paise integer)
language plpgsql set search_path to ''
as $function$
declare
  v_order_id uuid; v_order_number bigint; v_subtotal bigint := 0;
  v_item_count integer; v_matched_count integer; v_discount integer;
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
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.cafe_id=p_cafe_id and b.active=true) then raise exception 'Choose an active branch.'; end if;
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
  insert into public.order_items(order_id,cafe_id,menu_item_id,item_name_snapshot,quantity,unit_price_paise,line_total_paise)
  select v_order_id,p_cafe_id,mi.id,mi.name,sum(x.quantity)::integer,mi.price_paise,(sum(x.quantity)::bigint*mi.price_paise)::integer
  from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity integer)
  join public.menu_items mi on mi.id=x.menu_item_id and mi.cafe_id=p_cafe_id and (mi.branch_id is null or mi.branch_id=p_branch_id) and mi.is_available=true
  group by mi.id,mi.name,mi.price_paise;
  return query select v_order_id,v_order_number,v_subtotal::integer,v_discount,(v_subtotal-v_discount)::integer;
end;
$function$;

revoke all on function public.create_pos_order_v2(uuid,uuid,public.order_type,text,text,jsonb,integer,text) from public;
grant execute on function public.create_pos_order_v2(uuid,uuid,public.order_type,text,text,jsonb,integer,text) to authenticated;
