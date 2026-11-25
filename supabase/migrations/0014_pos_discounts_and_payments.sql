-- POS discounts and payment ledger (manual payment recording only; no gateway).
alter table public.orders add column if not exists discount_paise integer not null default 0 check (discount_paise >= 0 and discount_paise <= subtotal_paise);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  amount_paise integer not null check (amount_paise > 0),
  method text not null check (method in ('cash','card','upi')),
  reference text,
  recorded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists order_payments_order_id_idx on public.order_payments(order_id);
alter table public.order_payments enable row level security;
revoke all on public.order_payments from anon, authenticated;
grant select on public.order_payments to authenticated;
drop policy if exists "Members read order payments" on public.order_payments;
create policy "Members read order payments" on public.order_payments for select to authenticated using (public.is_cafe_member(cafe_id));

create or replace function public.create_pos_order_v2(
  p_cafe_id uuid,p_branch_id uuid,p_order_type public.order_type,p_customer_name text,p_notes text,p_items jsonb,p_discount_paise integer default 0
)
returns table(order_id uuid,order_number bigint,subtotal_paise integer,discount_paise integer,total_paise integer)
language plpgsql security invoker set search_path=''
as $$
declare v_order_id uuid;v_order_number bigint;v_subtotal bigint:=0;v_item_count integer;v_matched_count integer;v_discount integer;
begin
 if (select auth.uid()) is null then raise exception 'Sign in is required.'; end if;
 if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>50 then raise exception 'Add between 1 and 50 menu items.'; end if;
 if p_discount_paise is null or p_discount_paise<0 then raise exception 'Discount cannot be negative.'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity integer) where x.menu_item_id is null or x.quantity is null or x.quantity<1 or x.quantity>99) then raise exception 'Each item needs a valid menu item and quantity between 1 and 99.'; end if;
 if not exists(select 1 from public.branches b where b.id=p_branch_id and b.cafe_id=p_cafe_id and b.active=true) then raise exception 'Choose an active branch.'; end if;
 select count(distinct x.menu_item_id),count(distinct mi.id),coalesce(sum(mi.price_paise::bigint*x.quantity),0) into v_item_count,v_matched_count,v_subtotal
 from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity integer)
 left join public.menu_items mi on mi.id=x.menu_item_id and mi.cafe_id=p_cafe_id and (mi.branch_id is null or mi.branch_id=p_branch_id) and mi.is_available=true;
 if v_item_count<>v_matched_count then raise exception 'One or more items are unavailable. Refresh the menu.'; end if;
 if v_subtotal>2147483647 or p_discount_paise>v_subtotal then raise exception 'Discount cannot exceed the bill subtotal.'; end if;
 v_discount:=p_discount_paise;
 insert into public.orders(cafe_id,branch_id,order_type,status,customer_name,notes,subtotal_paise,discount_paise,tax_paise,total_paise,created_by)
 values(p_cafe_id,p_branch_id,p_order_type,'pending',nullif(left(trim(coalesce(p_customer_name,'')),100),''),nullif(left(trim(coalesce(p_notes,'')),500),''),v_subtotal::integer,v_discount,0,(v_subtotal-v_discount)::integer,(select auth.uid()))
 returning id,orders.order_number into v_order_id,v_order_number;
 insert into public.order_items(order_id,cafe_id,menu_item_id,item_name_snapshot,quantity,unit_price_paise,line_total_paise)
 select v_order_id,p_cafe_id,mi.id,mi.name,sum(x.quantity)::integer,mi.price_paise,(sum(x.quantity)::bigint*mi.price_paise)::integer
 from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity integer)
 join public.menu_items mi on mi.id=x.menu_item_id and mi.cafe_id=p_cafe_id and (mi.branch_id is null or mi.branch_id=p_branch_id) and mi.is_available=true
 group by mi.id,mi.name,mi.price_paise;
 return query select v_order_id,v_order_number,v_subtotal::integer,v_discount,(v_subtotal-v_discount)::integer;
end; $$;
revoke all on function public.create_pos_order_v2(uuid,uuid,public.order_type,text,text,jsonb,integer) from public,anon;
grant execute on function public.create_pos_order_v2(uuid,uuid,public.order_type,text,text,jsonb,integer) to authenticated;

create or replace function public.record_pos_payment(p_order_id uuid,p_method text,p_amount_paise integer,p_reference text default null)
returns table(payment_id uuid,paid_paise bigint,due_paise bigint)
language plpgsql security definer set search_path=''
as $$
declare v_order public.orders%rowtype;v_paid bigint;
begin
 if (select auth.uid()) is null then raise exception 'Sign in is required.'; end if;
 if p_method not in ('cash','card','upi') then raise exception 'Choose cash, card or UPI.'; end if;
 if p_amount_paise is null or p_amount_paise<=0 then raise exception 'Enter a payment amount greater than zero.'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 if not public.has_cafe_role(v_order.cafe_id,array['owner'::public.cafe_role,'manager'::public.cafe_role]) then raise exception 'Only café owners and managers can record payments.'; end if;
 select coalesce(sum(amount_paise),0) into v_paid from public.order_payments where order_id=p_order_id;
 if v_paid+p_amount_paise>v_order.total_paise then raise exception 'Payment exceeds the remaining balance.'; end if;
 insert into public.order_payments(order_id,cafe_id,amount_paise,method,reference,recorded_by)
 values(p_order_id,v_order.cafe_id,p_amount_paise,p_method,nullif(left(trim(coalesce(p_reference,'')),100),''),(select auth.uid()))
 returning id into payment_id;
 paid_paise:=v_paid+p_amount_paise;due_paise:=v_order.total_paise-paid_paise;return next;
end; $$;
revoke all on function public.record_pos_payment(uuid,text,integer,text) from public,anon;
grant execute on function public.record_pos_payment(uuid,text,integer,text) to authenticated;
