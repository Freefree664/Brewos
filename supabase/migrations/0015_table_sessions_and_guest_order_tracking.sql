create table if not exists public.table_order_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null unique references public.dining_tables(id) on delete cascade,
  access_code text not null check (access_code ~ '^[0-9]{6}$'),
  started_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.table_order_sessions enable row level security;
revoke all on public.table_order_sessions from anon, authenticated;

create or replace function public.start_table_session(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_table public.dining_tables%rowtype; v_code text;
begin
  if auth.uid() is null then raise exception 'Please sign in as café staff.'; end if;
  select * into v_table from public.dining_tables where id=p_table_id and active=true for update;
  if not found then raise exception 'This table is inactive.'; end if;
  if not public.has_cafe_role(v_table.cafe_id,array['owner','manager','waiter']::public.cafe_role[]) then raise exception 'You do not have permission to activate this table.'; end if;
  v_code := lpad((floor(random()*1000000)::integer)::text,6,'0');
  insert into public.table_order_sessions(table_id,access_code,started_by,started_at,ended_at)
  values(p_table_id,v_code,auth.uid(),now(),null)
  on conflict(table_id) do update set access_code=excluded.access_code,started_by=excluded.started_by,started_at=now(),ended_at=null;
  return jsonb_build_object('active',true,'pin',v_code,'started_at',now());
end;
$$;

create or replace function public.end_table_session(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cafe_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in as café staff.'; end if;
  select cafe_id into v_cafe_id from public.dining_tables where id=p_table_id and active=true;
  if v_cafe_id is null then raise exception 'Active table not found.'; end if;
  if not public.has_cafe_role(v_cafe_id,array['owner','manager','waiter']::public.cafe_role[]) then raise exception 'You do not have permission to close this table session.'; end if;
  update public.table_order_sessions set ended_at=now() where table_id=p_table_id and ended_at is null;
  return jsonb_build_object('active',false);
end;
$$;

create or replace function public.get_table_session_status(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cafe_id uuid; v_session public.table_order_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in as café staff.'; end if;
  select cafe_id into v_cafe_id from public.dining_tables where id=p_table_id;
  if v_cafe_id is null or not public.has_cafe_role(v_cafe_id,array['owner','manager','waiter']::public.cafe_role[]) then raise exception 'You do not have permission to view this table session.'; end if;
  select * into v_session from public.table_order_sessions where table_id=p_table_id;
  return jsonb_build_object('active',coalesce(v_session.ended_at is null and v_session.id is not null,false),'pin',case when v_session.ended_at is null then v_session.access_code else null end,'started_at',v_session.started_at);
end;
$$;

create or replace function public.get_public_table_info(p_token text)
returns jsonb language sql security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('restaurant_name',c.name,'branch_name',b.name,'table_name',t.table_name,'active_pin',s.access_code)
  from public.dining_tables t
  join public.cafes c on c.id=t.cafe_id
  join public.branches b on b.id=t.branch_id and b.cafe_id=t.cafe_id
  left join public.table_order_sessions s on s.table_id=t.id and s.ended_at is null
  where p_token ~ '^[0-9a-fA-F]{64}$' and t.qr_token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
    and t.active=true and b.active=true and c.status='approved'
  limit 1;
$$;

create or replace function public.submit_guest_order(p_token text,p_pin text,p_items jsonb,p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_table public.dining_tables%rowtype; v_session public.table_order_sessions%rowtype; v_order_id uuid; v_item jsonb; v_menu_item public.menu_items%rowtype; v_qty integer; v_subtotal integer := 0; v_count integer := 0;
begin
  if coalesce(length(p_token),0)<32 then raise exception 'Invalid table QR.'; end if;
  if coalesce(p_pin,'') !~ '^[0-9]{6}$' then raise exception 'This table is not open for ordering yet.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'Your cart must contain 1 to 30 item lines.'; end if;
  select * into v_table from public.dining_tables where qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and active=true;
  if not found then raise exception 'This table QR is invalid or inactive.'; end if;
  select * into v_session from public.table_order_sessions where table_id=v_table.id and ended_at is null for update;
  if not found then raise exception 'This table is not open for ordering yet. Please wait for café staff.'; end if;
  if v_session.access_code<>p_pin then raise exception 'The table session code is no longer valid. Please refresh this page.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_count:=v_count+1;
    if coalesce(v_item->>'menu_item_id','')='' then raise exception 'Invalid cart item.'; end if;
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty<1 or v_qty>20 then raise exception 'Item quantity must be between 1 and 20.'; end if;
    select * into v_menu_item from public.menu_items where id=(v_item->>'menu_item_id')::uuid and cafe_id=v_table.cafe_id and is_available=true and (branch_id is null or branch_id=v_table.branch_id);
    if not found then raise exception 'An item is unavailable. Refresh the menu and try again.'; end if;
    v_subtotal:=v_subtotal+(v_menu_item.price_paise*v_qty);
  end loop;
  insert into public.orders(cafe_id,branch_id,table_id,order_type,status,notes,subtotal_paise,tax_paise,total_paise)
  values(v_table.cafe_id,v_table.branch_id,v_table.id,'dine_in','pending',left(coalesce(p_notes,''),500),v_subtotal,0,v_subtotal) returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=(v_item->>'quantity')::integer;
    select * into v_menu_item from public.menu_items where id=(v_item->>'menu_item_id')::uuid and cafe_id=v_table.cafe_id and is_available=true and (branch_id is null or branch_id=v_table.branch_id);
    insert into public.order_items(order_id,cafe_id,menu_item_id,item_name_snapshot,quantity,unit_price_paise,line_total_paise)
    values(v_order_id,v_table.cafe_id,v_menu_item.id,v_menu_item.name,v_qty,v_menu_item.price_paise,v_menu_item.price_paise*v_qty);
  end loop;
  return jsonb_build_object('order_id',v_order_id,'status','pending','total_paise',v_subtotal);
end;
$$;

create or replace function public.get_guest_order_status(p_token text,p_order_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('order_id',o.id,'order_number',o.order_number,'status',o.status,'updated_at',o.updated_at)
  from public.orders o join public.dining_tables t on t.id=o.table_id
  where o.id=p_order_id and t.qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.active=true limit 1;
$$;

revoke all on function public.start_table_session(uuid) from public,anon;
revoke all on function public.end_table_session(uuid) from public,anon;
revoke all on function public.get_table_session_status(uuid) from public,anon;
revoke all on function public.get_public_table_info(text) from public;
revoke all on function public.submit_guest_order(text,text,jsonb,text) from public;
revoke all on function public.get_guest_order_status(text,uuid) from public;
grant execute on function public.start_table_session(uuid) to authenticated;
grant execute on function public.end_table_session(uuid) to authenticated;
grant execute on function public.get_table_session_status(uuid) to authenticated;
grant execute on function public.get_public_table_info(text) to anon,authenticated;
grant execute on function public.submit_guest_order(text,text,jsonb,text) to anon,authenticated;
grant execute on function public.get_guest_order_status(text,uuid) to anon,authenticated;
