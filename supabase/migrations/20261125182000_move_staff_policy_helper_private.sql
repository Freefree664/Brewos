create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;

create or replace function private.is_linked_cafe_staff(p_cafe_id uuid,p_branch_id uuid,p_roles text[] default null)
returns boolean language sql stable security definer set search_path = ''
as $function$
 select exists(select 1 from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.cafe_id=p_cafe_id and sm.branch_id is not distinct from p_branch_id and (p_roles is null or sm.role=any(p_roles)));
$function$;
revoke all on function private.is_linked_cafe_staff(uuid,uuid,text[]) from public,anon;
grant execute on function private.is_linked_cafe_staff(uuid,uuid,text[]) to authenticated;

drop policy if exists "Linked staff read branch orders" on public.orders;
create policy "Linked staff read branch orders" on public.orders for select to authenticated using (
 private.is_linked_cafe_staff(cafe_id,branch_id,array['kitchen','cashier','manager'])
 or (private.is_linked_cafe_staff(cafe_id,branch_id,array['waiter']) and table_id is not null and exists(
  select 1 from public.dining_tables dt join public.staff_members sm on sm.id=dt.assigned_waiter_id
  where dt.id=orders.table_id and sm.auth_user_id=(select auth.uid()) and sm.active=true))
);

drop policy if exists "Linked staff read order items" on public.order_items;
create policy "Linked staff read order items" on public.order_items for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_items.order_id and (
  private.is_linked_cafe_staff(o.cafe_id,o.branch_id,array['kitchen','cashier','manager'])
  or (private.is_linked_cafe_staff(o.cafe_id,o.branch_id,array['waiter']) and o.table_id is not null and exists(
   select 1 from public.dining_tables dt join public.staff_members sm on sm.id=dt.assigned_waiter_id
   where dt.id=o.table_id and sm.auth_user_id=(select auth.uid()) and sm.active=true))))
);

drop function if exists public.is_linked_cafe_staff(uuid,uuid,text[]);
