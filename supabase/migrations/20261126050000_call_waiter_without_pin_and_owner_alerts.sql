begin;

-- Guest waiter calls no longer require the order PIN. Keep the old overload
-- inaccessible so clients cannot accidentally continue using the PIN route.
revoke all on function public.call_waiter_for_table(text,text) from public, anon, authenticated;

create or replace function public.call_waiter_for_table(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_table public.dining_tables%rowtype;
  v_session public.table_order_sessions%rowtype;
  v_call public.waiter_call_requests%rowtype;
begin
  if coalesce(p_token, '') !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('error', 'This table QR is invalid.');
  end if;

  -- Lock the table row so simultaneous calls for the same table serialize.
  select t.* into v_table
  from public.dining_tables t
  join public.branches b on b.id=t.branch_id and b.cafe_id=t.cafe_id
  join public.cafes c on c.id=t.cafe_id
  where t.qr_token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
    and t.active=true and b.active=true and c.status='approved'
  limit 1
  for update of t;

  if not found then
    return jsonb_build_object('error', 'This table QR is invalid or inactive.');
  end if;

  select s.* into v_session
  from public.table_order_sessions s
  where s.table_id=v_table.id and s.ended_at is null
  order by s.started_at desc
  limit 1;

  if not found then
    return jsonb_build_object('error', 'Please ask café staff to open this table first.');
  end if;

  select * into v_call
  from public.waiter_call_requests
  where table_id=v_table.id and status in ('pending','acknowledged')
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object('request_id',v_call.id,'status',v_call.status,'already_requested',true);
  end if;

  -- Public QR calls are PIN-free, so enforce a server-side cooldown.
  if exists (
    select 1 from public.waiter_call_requests r
    where r.table_id=v_table.id
      and r.created_at > pg_catalog.now() - interval '30 seconds'
  ) then
    return jsonb_build_object('error', 'Please wait a few seconds before calling again.');
  end if;

  insert into public.waiter_call_requests(cafe_id,branch_id,table_id)
  values(v_table.cafe_id,v_table.branch_id,v_table.id)
  returning * into v_call;

  return jsonb_build_object('request_id',v_call.id,'status',v_call.status,'already_requested',false);
end;
$function$;

revoke all on function public.call_waiter_for_table(text) from public;
grant execute on function public.call_waiter_for_table(text) to anon, authenticated;

commit;