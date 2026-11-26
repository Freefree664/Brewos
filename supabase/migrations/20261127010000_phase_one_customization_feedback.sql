-- Phase 1: secure menu customization and post-completion guest feedback.
create table if not exists public.menu_item_option_groups (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  required boolean not null default false,
  min_select integer not null default 0 check (min_select between 0 and 10),
  max_select integer not null default 1 check (max_select between 1 and 10),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint option_group_selection_bounds check (min_select <= max_select), 
  constraint required_group_has_minimum check (not required or min_select >= 1),
  unique (id, cafe_id)
);
create table if not exists public.menu_item_options (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  extra_price_paise integer not null default 0 check (extra_price_paise between 0 and 10000000),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint menu_item_options_group_fk foreign key (group_id,cafe_id)
    references public.menu_item_option_groups(id,cafe_id) on delete cascade
);
create index if not exists menu_item_option_groups_item_idx on public.menu_item_option_groups(menu_item_id,active,sort_order);
create index if not exists menu_item_options_group_idx on public.menu_item_options(group_id,active,sort_order);
alter table public.menu_item_option_groups enable row level security;
alter table public.menu_item_options enable row level security;
revoke all on public.menu_item_option_groups, public.menu_item_options from anon;
grant select,insert,update,delete on public.menu_item_option_groups, public.menu_item_options to authenticated;
drop policy if exists "Cafe members manage option groups" on public.menu_item_option_groups;
create policy "Cafe members manage option groups" on public.menu_item_option_groups
for all to authenticated
using (public.has_cafe_role(cafe_id,array['owner','manager']::public.cafe_role[]))
with check (
  public.has_cafe_role(cafe_id,array['owner','manager']::public.cafe_role[])
  and exists(select 1 from public.menu_items mi where mi.id=menu_item_id and mi.cafe_id=menu_item_option_groups.cafe_id)
);
drop policy if exists "Cafe members manage menu options" on public.menu_item_options;
create policy "Cafe members manage menu options" on public.menu_item_options
for all to authenticated
using (public.has_cafe_role(cafe_id,array['owner','manager']::public.cafe_role[]))
with check (
  public.has_cafe_role(cafe_id,array['owner','manager']::public.cafe_role[])
  and exists(select 1 from public.menu_item_option_groups g where g.id=group_id and g.cafe_id=menu_item_options.cafe_id)
);

create table if not exists public.order_feedback (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists order_feedback_cafe_created_idx on public.order_feedback(cafe_id,created_at desc);
alter table public.order_feedback enable row level security;
revoke all on public.order_feedback from anon,authenticated;
grant select on public.order_feedback to authenticated;
create policy "Cafe owners and managers read their feedback" on public.order_feedback
for select to authenticated
using (public.has_cafe_role(cafe_id,array['owner','manager']::public.cafe_role[]));

create or replace function public.get_public_cafe_menu(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
 select jsonb_build_object(
  'id',c.id,'name',c.name,'description',c.description,'logo_url',c.logo_url,
  'branch',(select jsonb_build_object('id',b.id,'name',b.name,'address',b.address)
    from public.branches b where b.cafe_id=c.id and b.active=true order by b.created_at limit 1),
  'categories',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',mc.id,'name',mc.name,
    'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',mi.id,'name',mi.name,'description',mi.description,'image_url',mi.image_url,
      'price_paise',mi.price_paise,
      'option_groups',coalesce((
       select jsonb_agg(jsonb_build_object(
        'id',g.id,'name',g.name,'required',g.required,'min_select',g.min_select,'max_select',g.max_select,
        'options',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'extra_price_paise',o.extra_price_paise)
          order by o.sort_order,o.name),'[]'::jsonb)
          from public.menu_item_options o where o.group_id=g.id and o.active=true)
       ) order by g.sort_order,g.name)
       from public.menu_item_option_groups g where g.menu_item_id=mi.id and g.cafe_id=c.id and g.active=true
      ),'[]'::jsonb)
    ) order by mi.sort_order,mi.name),'[]'::jsonb)
     from public.menu_items mi where mi.category_id=mc.id and mi.cafe_id=c.id and mi.is_available=true
      and (mi.branch_id is null or mi.branch_id=(select b.id from public.branches b where b.cafe_id=c.id and b.active=true order by b.created_at limit 1))
    )
   ) order by mc.sort_order,mc.name)
   from public.menu_categories mc where mc.cafe_id=c.id and mc.active=true
    and (mc.branch_id is null or mc.branch_id=(select b.id from public.branches b where b.cafe_id=c.id and b.active=true order by b.created_at limit 1))
  ),'[]'::jsonb)
 )
 from public.cafes c where c.slug=lower(trim(p_slug)) and c.status='approved' limit 1;
$function$;
revoke all on function public.get_public_cafe_menu(text) from public;
grant execute on function public.get_public_cafe_menu(text) to anon,authenticated;

-- New guest checkout endpoint preserves the existing PIN lockout while calculating every add-on from database rows.
create or replace function public.submit_guest_order_customized(
 p_token text,p_pin text,p_items jsonb,p_notes text default null,
 p_customer_name text default null,p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_session public.table_order_sessions%rowtype;
 v_table public.dining_tables%rowtype;
 v_item jsonb;
 v_menu_item public.menu_items%rowtype;
 v_option_ids uuid[];
 v_option_count integer;
 v_group record;
 v_group_count integer;
 v_base integer;
 v_extra integer;
 v_unit integer;
 v_qty integer;
 v_subtotal integer := 0;
 v_order_id uuid;
 v_phone text;
 v_snapshot jsonb;
 v_attempts integer;
begin
 if coalesce(p_token,'') !~ '^[0-9a-fA-F]{64}$' then return jsonb_build_object('error','Invalid table QR.'); end if;
 select * into v_table from public.dining_tables t
  where t.qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.active=true limit 1;
 if not found then return jsonb_build_object('error','This table QR is invalid or inactive.'); end if;
 select * into v_session from public.table_order_sessions s where s.table_id=v_table.id and s.ended_at is null for update;
 if not found then return jsonb_build_object('error','This table is not open for ordering yet.'); end if;
 if v_session.pin_locked_until is not null and v_session.pin_locked_until>now() then
  return jsonb_build_object('error','Too many incorrect codes. Please ask café staff to reset the table session.');
 end if;
 if coalesce(p_pin,'') !~ '^[0-9]{6}$' or v_session.access_code<>p_pin then
  v_attempts:=case when v_session.pin_locked_until is not null and v_session.pin_locked_until<=now() then 1 else v_session.failed_pin_attempts+1 end;
  update public.table_order_sessions set failed_pin_attempts=v_attempts,
   pin_locked_until=case when v_attempts>=5 then now()+interval '10 minutes' else null end where id=v_session.id;
  return jsonb_build_object('error',case when v_attempts>=5 then 'Too many incorrect codes. Please ask café staff to reset the table session.' else 'The six-digit code is incorrect. Please check with café staff.' end);
 end if;
 update public.table_order_sessions set failed_pin_attempts=0,pin_locked_until=null where id=v_session.id;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then
  return jsonb_build_object('error','Your cart must contain 1 to 30 item lines.');
 end if;
 v_phone:=nullif(left(trim(coalesce(p_customer_phone,'')),20),'');
 if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 -]{5,18}$' then
  return jsonb_build_object('error','Enter a valid mobile number or leave it blank.');
 end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if coalesce(v_item->>'menu_item_id','')='' then return jsonb_build_object('error','Invalid cart item.'); end if;
  if coalesce(v_item->>'quantity','') !~ '^[0-9]{1,2}$' then return jsonb_build_object('error','Invalid item quantity.'); end if;
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty<1 or v_qty>20 then return jsonb_build_object('error','Item quantity must be between 1 and 20.'); end if;
  select * into v_menu_item from public.menu_items mi where mi.id=(v_item->>'menu_item_id')::uuid
   and mi.cafe_id=v_table.cafe_id and mi.is_available=true and (mi.branch_id is null or mi.branch_id=v_table.branch_id);
  if not found then return jsonb_build_object('error','An item is unavailable. Refresh the menu and try again.'); end if;
  if jsonb_typeof(coalesce(v_item->'option_ids','[]'::jsonb))<>'array' then return jsonb_build_object('error','Invalid item customizations.'); end if;
  select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into v_option_ids
   from jsonb_array_elements_text(coalesce(v_item->'option_ids','[]'::jsonb)) x;
  if cardinality(v_option_ids)<>jsonb_array_length(coalesce(v_item->'option_ids','[]'::jsonb)) then
   return jsonb_build_object('error','Duplicate or invalid customization.'); end if;
  select count(*) into v_option_count from public.menu_item_options o
   join public.menu_item_option_groups g on g.id=o.group_id and g.cafe_id=o.cafe_id
   where o.id=any(v_option_ids) and o.cafe_id=v_table.cafe_id and o.active=true and g.active=true and g.menu_item_id=v_menu_item.id;
  if v_option_count<>cardinality(v_option_ids) then return jsonb_build_object('error','A selected option is no longer available. Refresh the menu.'); end if;
  for v_group in select g.id,g.min_select,g.max_select,g.required from public.menu_item_option_groups g
    where g.menu_item_id=v_menu_item.id and g.cafe_id=v_table.cafe_id and g.active=true loop
   select count(*) into v_group_count from public.menu_item_options o where o.group_id=v_group.id and o.id=any(v_option_ids) and o.active=true;
   if v_group_count<v_group.min_select or v_group_count>v_group.max_select then
    return jsonb_build_object('error','Please review the selections for '||v_menu_item.name||'.');
   end if;
  end loop;
  select coalesce(sum(o.extra_price_paise),0) into v_extra from public.menu_item_options o
   where o.id=any(v_option_ids) and o.cafe_id=v_table.cafe_id;
  v_unit:=v_menu_item.price_paise+v_extra;
  if v_unit>100000000 then return jsonb_build_object('error','This item total is too high. Please contact café staff.'); end if;
  v_subtotal:=v_subtotal+(v_unit*v_qty);
 end loop;
 insert into public.orders(cafe_id,branch_id,table_id,order_type,status,customer_name,customer_phone,notes,subtotal_paise,tax_paise,total_paise)
 values(v_table.cafe_id,v_table.branch_id,v_table.id,'dine_in','pending',
  nullif(left(trim(coalesce(p_customer_name,'')),100),''),v_phone,left(coalesce(p_notes,''),500),v_subtotal,0,v_subtotal)
 returning id into v_order_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  select * into v_menu_item from public.menu_items mi where mi.id=(v_item->>'menu_item_id')::uuid
   and mi.cafe_id=v_table.cafe_id and mi.is_available=true and (mi.branch_id is null or mi.branch_id=v_table.branch_id);
  select coalesce(array_agg(x::uuid),'{}'::uuid[]) into v_option_ids
   from jsonb_array_elements_text(coalesce(v_item->'option_ids','[]'::jsonb)) x;
  select coalesce(sum(o.extra_price_paise),0) into v_extra from public.menu_item_options o
   where o.id=any(v_option_ids) and o.cafe_id=v_table.cafe_id;
  v_unit:=v_menu_item.price_paise+v_extra;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'extra_price_paise',o.extra_price_paise) order by g.sort_order,g.name,o.sort_order,o.name),'[]'::jsonb)
   into v_snapshot from public.menu_item_options o join public.menu_item_option_groups g on g.id=o.group_id
   where o.id=any(v_option_ids) and o.cafe_id=v_table.cafe_id;
  insert into public.order_items(order_id,cafe_id,menu_item_id,item_name_snapshot,quantity,unit_price_paise,unit_cost_paise,line_total_paise,customizations)
  values(v_order_id,v_table.cafe_id,v_menu_item.id,v_menu_item.name,v_qty,v_unit,
   (select c.cost_price_paise from public.menu_item_costs c where c.menu_item_id=v_menu_item.id and c.cafe_id=v_table.cafe_id),
   v_unit*v_qty,v_snapshot);
 end loop;
 return jsonb_build_object('order_id',v_order_id,'status','pending','total_paise',v_subtotal);
end;
$function$;
revoke all on function public.submit_guest_order_customized(text,text,jsonb,text,text,text) from public;
grant execute on function public.submit_guest_order_customized(text,text,jsonb,text,text,text) to anon,authenticated;

create or replace function public.submit_order_feedback(p_token text,p_order_id uuid,p_rating integer,p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_order public.orders%rowtype;
 v_table public.dining_tables%rowtype;
 v_id uuid;
begin
 if coalesce(p_token,'') !~ '^[0-9a-fA-F]{64}$' or p_rating is null or p_rating not between 1 and 5 then
  return jsonb_build_object('error','Please provide a valid rating.');
 end if;
 select * into v_order from public.orders o where o.id=p_order_id and o.table_id is not null;
 if not found then return jsonb_build_object('error','Order not found.'); end if;
 select * into v_table from public.dining_tables t where t.id=v_order.table_id
  and t.qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.active=true;
 if not found then return jsonb_build_object('error','This order cannot be verified for this table.'); end if;
 if v_order.status<>'completed' then return jsonb_build_object('error','Feedback is available after the order is completed.'); end if;
 insert into public.order_feedback(cafe_id,order_id,rating,comment)
 values(v_order.cafe_id,v_order.id,p_rating,nullif(left(trim(coalesce(p_comment,'')),1000),''))
 on conflict(order_id) do nothing returning id into v_id;
 if v_id is null then return jsonb_build_object('error','Feedback has already been submitted for this order.'); end if;
 return jsonb_build_object('success',true,'feedback_id',v_id);
end;
$function$;
revoke all on function public.submit_order_feedback(text,uuid,integer,text) from public;
grant execute on function public.submit_order_feedback(text,uuid,integer,text) to anon,authenticated;


create or replace function public.get_guest_order_status(p_token text,p_order_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
 select jsonb_build_object(
  'order_id',o.id,'order_number',o.order_number,'status',o.status,'updated_at',o.updated_at,
  'subtotal_paise',o.subtotal_paise,'discount_paise',coalesce(o.discount_paise,0),
  'tax_paise',o.tax_paise,'total_paise',o.total_paise,'restaurant_name',c.name,'upi_id',c.upi_id,
  'loyalty_points_earned',coalesce((select sum(l.points_delta) from public.customer_loyalty_ledger l where l.order_id=o.id and l.points_delta>0),0),
  'loyalty_points_balance',case when o.status='completed' and o.customer_phone is not null then
   coalesce((select a.points_balance from public.customer_loyalty_accounts a where a.cafe_id=o.cafe_id and a.customer_phone=o.customer_phone),0) else 0 end,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'name',oi.item_name_snapshot,'quantity',oi.quantity,'unit_price_paise',oi.unit_price_paise,
    'line_total_paise',oi.line_total_paise,'customizations',coalesce(oi.customizations,'[]'::jsonb)
   ) order by oi.created_at) from public.order_items oi where oi.order_id=o.id),'[]'::jsonb)
 )
 from public.orders o join public.dining_tables t on t.id=o.table_id join public.cafes c on c.id=o.cafe_id
 where o.id=p_order_id and t.qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and t.active=true
 limit 1;
$function$;
revoke all on function public.get_guest_order_status(text,uuid) from public;
grant execute on function public.get_guest_order_status(text,uuid) to anon,authenticated;
