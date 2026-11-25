alter table public.staff_members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists invite_email text,
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz;

create unique index if not exists staff_members_auth_user_unique on public.staff_members(auth_user_id) where auth_user_id is not null;

create or replace function public.create_staff_invite(p_staff_id uuid,p_email text,p_token text)
returns timestamptz language plpgsql security definer set search_path = ''
as $function$
declare v_cafe_id uuid; v_expires timestamptz := now() + interval '7 days';
begin
 if (select auth.uid()) is null then raise exception 'Sign in is required.'; end if;
 if length(coalesce(p_token,'')) <> 64 or coalesce(p_email,'') !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid staff email and invitation token.'; end if;
 select cafe_id into v_cafe_id from public.staff_members where id=p_staff_id and active=true;
 if v_cafe_id is null or not public.has_cafe_role(v_cafe_id,array['owner'::public.cafe_role,'manager'::public.cafe_role]) then raise exception 'Only café owners and managers can invite active staff.'; end if;
 if exists(select 1 from public.staff_members where lower(invite_email)=lower(trim(p_email)) and auth_user_id is not null and id<>p_staff_id) then raise exception 'This email is already linked to another staff profile.'; end if;
 update public.staff_members set invite_email=lower(trim(p_email)),invite_token_hash=encode(extensions.digest(p_token,'sha256'),'hex'),invite_expires_at=v_expires
 where id=p_staff_id and cafe_id=v_cafe_id and auth_user_id is null;
 if not found then raise exception 'This staff profile already has a login or is unavailable.'; end if;
 return v_expires;
end; $function$;

create or replace function public.claim_staff_invite(p_token text)
returns table(staff_id uuid,cafe_id uuid,branch_id uuid,full_name text,role text)
language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_email text;
begin
 if v_user_id is null then raise exception 'Sign in to your BrewOS account first.'; end if;
 select lower(u.email) into v_email from auth.users u where u.id=v_user_id and u.email_confirmed_at is not null;
 if v_email is null then raise exception 'Confirm your account email before claiming a staff invitation.'; end if;
 if length(coalesce(p_token,'')) <> 64 then raise exception 'Invalid or expired staff invitation.'; end if;
 return query update public.staff_members sm
 set auth_user_id=v_user_id,invite_token_hash=null,invite_expires_at=null
 where sm.invite_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and sm.invite_email=v_email
 and sm.active=true and sm.auth_user_id is null and sm.invite_expires_at>now()
 returning sm.id,sm.cafe_id,sm.branch_id,sm.full_name,sm.role;
 if not found then raise exception 'Invitation is invalid, expired, already used, or belongs to another email.'; end if;
end; $function$;

alter table public.staff_members enable row level security;
drop policy if exists "Staff read own linked profile" on public.staff_members;
create policy "Staff read own linked profile" on public.staff_members for select to authenticated using (auth_user_id=(select auth.uid()) and active=true);

create or replace function public.is_linked_cafe_staff(p_cafe_id uuid,p_branch_id uuid,p_roles text[] default null)
returns boolean language sql stable security definer set search_path = ''
as $function$
 select exists(select 1 from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.cafe_id=p_cafe_id and sm.branch_id is not distinct from p_branch_id and (p_roles is null or sm.role=any(p_roles)));
$function$;

drop policy if exists "Linked staff read branch orders" on public.orders;
create policy "Linked staff read branch orders" on public.orders for select to authenticated using (
 public.is_linked_cafe_staff(cafe_id,branch_id,array['kitchen','cashier','manager'])
 or (public.is_linked_cafe_staff(cafe_id,branch_id,array['waiter']) and table_id is not null and exists(
  select 1 from public.dining_tables dt join public.staff_members sm on sm.id=dt.assigned_waiter_id
  where dt.id=orders.table_id and sm.auth_user_id=(select auth.uid()) and sm.active=true))
);

drop policy if exists "Linked staff read order items" on public.order_items;
create policy "Linked staff read order items" on public.order_items for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_items.order_id and (
  public.is_linked_cafe_staff(o.cafe_id,o.branch_id,array['kitchen','cashier','manager'])
  or (public.is_linked_cafe_staff(o.cafe_id,o.branch_id,array['waiter']) and o.table_id is not null and exists(
   select 1 from public.dining_tables dt join public.staff_members sm on sm.id=dt.assigned_waiter_id
   where dt.id=o.table_id and sm.auth_user_id=(select auth.uid()) and sm.active=true))))
);

drop policy if exists "Linked waiters read assigned tables" on public.dining_tables;
create policy "Linked waiters read assigned tables" on public.dining_tables for select to authenticated using (
 assigned_waiter_id in (select sm.id from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.role='waiter'));

drop policy if exists "Linked staff read own shifts" on public.staff_shifts;
create policy "Linked staff read own shifts" on public.staff_shifts for select to authenticated using (
 staff_id in (select sm.id from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true));

drop policy if exists "Linked staff read own attendance" on public.staff_attendance;
create policy "Linked staff read own attendance" on public.staff_attendance for select to authenticated using (
 staff_id in (select sm.id from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true));

drop policy if exists "Linked staff create own attendance" on public.staff_attendance;
create policy "Linked staff create own attendance" on public.staff_attendance for insert to authenticated with check (
 exists(select 1 from public.staff_members sm where sm.id=staff_attendance.staff_id and sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.cafe_id=staff_attendance.cafe_id));

drop policy if exists "Linked staff update own attendance" on public.staff_attendance;
create policy "Linked staff update own attendance" on public.staff_attendance for update to authenticated using (
 staff_id in (select sm.id from public.staff_members sm where sm.auth_user_id=(select auth.uid()) and sm.active=true))
 with check (exists(select 1 from public.staff_members sm where sm.id=staff_attendance.staff_id and sm.auth_user_id=(select auth.uid()) and sm.active=true and sm.cafe_id=staff_attendance.cafe_id));

revoke all on function public.create_staff_invite(uuid,text,text) from public,anon;
revoke all on function public.claim_staff_invite(text) from public,anon;
grant execute on function public.create_staff_invite(uuid,text,text) to authenticated;
grant execute on function public.claim_staff_invite(text) to authenticated;
revoke all on function public.is_linked_cafe_staff(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.is_linked_cafe_staff(uuid,uuid,text[]) to authenticated;
