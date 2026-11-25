create or replace function public.staff_update_order_status(p_order_id uuid,p_status text)
returns public.order_status
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_order public.orders%rowtype;
 v_staff public.staff_members%rowtype;
 v_next public.order_status;
begin
 if (select auth.uid()) is null then raise exception 'Sign in is required.'; end if;
 begin v_next:=p_status::public.order_status;
 exception when others then raise exception 'Invalid order status.'; end;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 select * into v_staff from public.staff_members
 where auth_user_id=(select auth.uid()) and active=true
 and cafe_id=v_order.cafe_id and branch_id is not distinct from v_order.branch_id;
 if not found then raise exception 'No active staff access for this order branch.'; end if;
 if v_staff.role='kitchen' then
  if not ((v_order.status='pending' and v_next in ('accepted','preparing')) or (v_order.status='accepted' and v_next='preparing') or (v_order.status='preparing' and v_next='ready')) then raise exception 'Kitchen staff can only move orders through accepted, preparing and ready.'; end if;
 elsif v_staff.role='waiter' then
  if v_order.status<>'ready' or v_next<>'served' or v_order.table_id is null or not exists(select 1 from public.dining_tables dt where dt.id=v_order.table_id and dt.assigned_waiter_id=v_staff.id) then raise exception 'Waiters can mark ready orders served only at tables assigned to them.'; end if;
 elsif v_staff.role='manager' then
  if not ((v_order.status='pending' and v_next='accepted') or (v_order.status='accepted' and v_next='preparing') or (v_order.status='preparing' and v_next='ready') or (v_order.status='ready' and v_next='served')) then raise exception 'Managers can advance branch orders through accepted, preparing, ready and served.'; end if;
 else raise exception 'Your staff role cannot change order status.';
 end if;
 update public.orders set status=v_next,updated_at=now() where id=v_order.id;
 return v_next;
end;
$function$;

create or replace function public.staff_record_order_payment(p_order_id uuid,p_method text,p_amount_paise integer,p_reference text default null)
returns table(payment_id uuid,paid_paise bigint,due_paise bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare v_order public.orders%rowtype; v_staff public.staff_members%rowtype; v_paid bigint;
begin
 if (select auth.uid()) is null then raise exception 'Sign in is required.'; end if;
 if p_method not in ('cash','card','upi') then raise exception 'Choose cash, card or UPI.'; end if;
 if p_amount_paise is null or p_amount_paise<=0 then raise exception 'Enter a payment amount greater than zero.'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 select * into v_staff from public.staff_members where auth_user_id=(select auth.uid()) and active=true and cafe_id=v_order.cafe_id and branch_id is not distinct from v_order.branch_id;
 if not found or v_staff.role not in ('cashier','manager') then raise exception 'Only assigned cashier or manager staff can record branch payments.'; end if;
 if v_order.status in ('completed','cancelled') then raise exception 'This order is already closed.'; end if;
 select coalesce(sum(op.amount_paise),0) into v_paid from public.order_payments op where op.order_id=p_order_id;
 if v_paid+p_amount_paise>v_order.total_paise then raise exception 'Payment exceeds the remaining balance.'; end if;
 insert into public.order_payments(order_id,cafe_id,amount_paise,method,reference,recorded_by) values(p_order_id,v_order.cafe_id,p_amount_paise,p_method,nullif(left(trim(coalesce(p_reference,'')),100),''),(select auth.uid())) returning id into payment_id;
 paid_paise:=v_paid+p_amount_paise; due_paise:=v_order.total_paise-paid_paise; return next;
end;
$function$;
revoke all on function public.staff_update_order_status(uuid,text) from public,anon;
grant execute on function public.staff_update_order_status(uuid,text) to authenticated;
revoke all on function public.staff_record_order_payment(uuid,text,integer,text) from public,anon;
grant execute on function public.staff_record_order_payment(uuid,text,integer,text) to authenticated;
