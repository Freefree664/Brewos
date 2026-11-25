create or replace function public.staff_update_order_status(p_order_id uuid,p_status text)
returns public.order_status
language plpgsql
security definer
set search_path = ''
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
  if not (
   (v_order.status='pending' and v_next in ('accepted','preparing'))
   or (v_order.status='accepted' and v_next='preparing')
   or (v_order.status='preparing' and v_next='ready')
  ) then raise exception 'Kitchen staff can only move orders through accepted, preparing and ready.'; end if;
 elsif v_staff.role='waiter' then
  if v_order.status<>'ready' or v_next<>'served' or v_order.table_id is null
   or not exists(select 1 from public.dining_tables dt where dt.id=v_order.table_id and dt.assigned_waiter_id=v_staff.id)
  then raise exception 'Waiters can mark ready orders served only at tables assigned to them.'; end if;
 else
  raise exception 'Your staff role cannot change order status.';
 end if;
 update public.orders set status=v_next,updated_at=now() where id=v_order.id;
 return v_next;
end;
$function$;
revoke all on function public.staff_update_order_status(uuid,text) from public,anon;
grant execute on function public.staff_update_order_status(uuid,text) to authenticated;
