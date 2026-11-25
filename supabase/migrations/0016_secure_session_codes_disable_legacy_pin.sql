create or replace function public.start_table_session(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_table public.dining_tables%rowtype; v_code text; v_random bytea; v_number bigint;
begin
  if auth.uid() is null then raise exception 'Please sign in as café staff.'; end if;
  select * into v_table from public.dining_tables where id=p_table_id and active=true for update;
  if not found then raise exception 'This table is inactive.'; end if;
  if not public.has_cafe_role(v_table.cafe_id,array['owner','manager','waiter']::public.cafe_role[]) then
    raise exception 'You do not have permission to activate this table.';
  end if;
  v_random := extensions.gen_random_bytes(4);
  v_number := get_byte(v_random,0)::bigint*16777216 + get_byte(v_random,1)::bigint*65536 + get_byte(v_random,2)::bigint*256 + get_byte(v_random,3)::bigint;
  v_code := lpad((v_number % 1000000)::text,6,'0');
  insert into public.table_order_sessions(table_id,access_code,started_by,started_at,ended_at)
  values(p_table_id,v_code,auth.uid(),now(),null)
  on conflict(table_id) do update set access_code=excluded.access_code,started_by=excluded.started_by,started_at=now(),ended_at=null;
  return jsonb_build_object('active',true,'pin',v_code,'started_at',now());
end;
$$;
revoke all on function public.issue_table_order_pin(uuid) from public,anon,authenticated;