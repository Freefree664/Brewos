begin;

create table if not exists public.waiter_call_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  table_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','acknowledged','served','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waiter_call_table_fk foreign key (table_id)
    references public.dining_tables(id) on delete cascade
);

create index if not exists waiter_call_requests_branch_status_created_idx
  on public.waiter_call_requests(branch_id, status, created_at desc);

create unique index if not exists waiter_call_one_pending_per_table_idx
  on public.waiter_call_requests(table_id)
  where status in ('pending','acknowledged');

alter table public.waiter_call_requests enable row level security;
revoke all on public.waiter_call_requests from anon, authenticated;

create or replace function public.call_waiter_for_table(p_token text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_table public.dining_tables%rowtype;
  v_session public.table_order_sessions%rowtype;
  v_call public.waiter_call_requests%rowtype;
  v_failed integer;
begin
  if coalesce(p_token, '') !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('error', 'This table QR is invalid.');
  end if;

  select t.* into v_table
  from public.dining_tables t
  join public.branches b on b.id=t.branch_id and b.cafe_id=t.cafe_id
  join public.cafes c on c.id=t.cafe_id
  where t.qr_token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
    and t.active=true and b.active=true and c.status='approved'
  limit 1;

  if not found then
    return jsonb_build_object('error', 'This table QR is invalid or inactive.');
  end if;

  select s.* into v_session
  from public.table_order_sessions s
  where s.table_id=v_table.id and s.ended_at is null
  for update;

  if not found then
    return jsonb_build_object('error', 'Please ask café staff to open this table first.');
  end if;

  if v_session.pin_locked_until is not null and v_session.pin_locked_until > pg_catalog.now() then
    return jsonb_build_object('error', 'Too many incorrect codes. Please ask café staff for help.');
  end if;

  if coalesce(p_pin, '') !~ '^[0-9]{6}$' or v_session.access_code <> p_pin then
    v_failed := case
      when v_session.pin_locked_until is not null and v_session.pin_locked_until <= pg_catalog.now()
        then 1
      else v_session.failed_pin_attempts + 1
    end;
    update public.table_order_sessions
      set failed_pin_attempts=v_failed,
          pin_locked_until=case when v_failed >= 5 then pg_catalog.now() + interval '10 minutes' else null end
    where id=v_session.id;
    return jsonb_build_object('error',
      case when v_failed >= 5
        then 'Too many incorrect codes. Please ask café staff for help.'
        else 'That six-digit code is incorrect. Please check with café staff.'
      end);
  end if;

  update public.table_order_sessions
    set failed_pin_attempts=0, pin_locked_until=null
  where id=v_session.id;

  select * into v_call
  from public.waiter_call_requests
  where table_id=v_table.id and status in ('pending','acknowledged')
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object('request_id',v_call.id,'status',v_call.status,'already_requested',true);
  end if;

  insert into public.waiter_call_requests(cafe_id,branch_id,table_id)
  values(v_table.cafe_id,v_table.branch_id,v_table.id)
  on conflict (table_id) where status in ('pending','acknowledged') do nothing
  returning * into v_call;

  if not found then
    select * into v_call from public.waiter_call_requests
    where table_id=v_table.id and status in ('pending','acknowledged')
    order by created_at desc limit 1;
    return jsonb_build_object('request_id',v_call.id,'status',v_call.status,'already_requested',true);
  end if;

  return jsonb_build_object('request_id',v_call.id,'status',v_call.status,'already_requested',false);
end;
$function$;

create or replace function public.get_staff_waiter_calls()
returns table(
  id uuid,
  cafe_id uuid,
  branch_id uuid,
  table_id uuid,
  table_name text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select r.id,r.cafe_id,r.branch_id,r.table_id,t.table_name,r.status,r.created_at
  from public.waiter_call_requests r
  join public.dining_tables t on t.id=r.table_id and t.cafe_id=r.cafe_id and t.branch_id=r.branch_id
  where r.status in ('pending','acknowledged')
    and (
      exists (
        select 1 from public.staff_members sm
        where sm.auth_user_id=(select auth.uid())
          and sm.active=true
          and sm.cafe_id=r.cafe_id
          and sm.branch_id=r.branch_id
          and (
            (sm.role='waiter' and t.assigned_waiter_id=sm.id)
            or sm.role='manager'
          )
      )
      or public.has_cafe_role(r.cafe_id,array['owner'::public.cafe_role,'manager'::public.cafe_role])
    )
  order by r.created_at asc;
$function$;

create or replace function public.update_waiter_call_status(p_call_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_call public.waiter_call_requests%rowtype;
  v_allowed boolean;
begin
  if p_status not in ('acknowledged','served','cancelled') then
    raise exception 'Invalid waiter request status.';
  end if;

  select r.* into v_call
  from public.waiter_call_requests r
  where r.id=p_call_id
  for update;

  if not found then raise exception 'Waiter request not found.'; end if;

  select (
    public.has_cafe_role(v_call.cafe_id,array['owner'::public.cafe_role,'manager'::public.cafe_role])
    or exists (
      select 1 from public.staff_members sm
      where sm.auth_user_id=(select auth.uid())
        and sm.active=true
        and sm.cafe_id=v_call.cafe_id
        and sm.branch_id=v_call.branch_id
        and (
          (sm.role='waiter' and exists (
            select 1 from public.dining_tables t
            where t.id=v_call.table_id and t.assigned_waiter_id=sm.id
          ))
          or sm.role='manager'
        )
    )
  ) into v_allowed;

  if not coalesce(v_allowed,false) then
    raise exception 'You do not have permission to update this waiter request.';
  end if;

  update public.waiter_call_requests
    set status=p_status,updated_at=pg_catalog.now()
  where id=p_call_id;

  return jsonb_build_object('id',p_call_id,'status',p_status);
end;
$function$;

revoke all on function public.call_waiter_for_table(text,text) from public;
revoke all on function public.get_staff_waiter_calls() from public,anon;
revoke all on function public.update_waiter_call_status(uuid,text) from public,anon;
grant execute on function public.call_waiter_for_table(text,text) to anon,authenticated;
grant execute on function public.get_staff_waiter_calls() to authenticated;
grant execute on function public.update_waiter_call_status(uuid,text) to authenticated;

commit;
