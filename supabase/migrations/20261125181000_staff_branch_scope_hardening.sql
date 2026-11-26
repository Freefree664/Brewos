create or replace function public.is_linked_cafe_staff(p_cafe_id uuid,p_branch_id uuid,p_roles text[] default null)
returns boolean language sql stable security definer set search_path = ''
as $function$
 select exists(select 1 from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.cafe_id=p_cafe_id and sm.branch_id is not distinct from p_branch_id and (p_roles is null or sm.role=any(p_roles)));
$function$;

drop policy if exists "Linked staff create own attendance" on public.staff_attendance;
create policy "Linked staff create own attendance" on public.staff_attendance for insert to authenticated with check (
 exists(select 1 from public.staff_members sm where sm.id=staff_attendance.staff_id and sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.cafe_id=staff_attendance.cafe_id));

drop policy if exists "Linked staff update own attendance" on public.staff_attendance;
create policy "Linked staff update own attendance" on public.staff_attendance for update to authenticated using (
 staff_id in (select sm.id from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true))
 with check (exists(select 1 from public.staff_members sm where sm.id=staff_attendance.staff_id and sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.cafe_id=staff_attendance.cafe_id));
