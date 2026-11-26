create or replace function public.get_public_table_info(p_token text)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'restaurant_name', c.name,
    'branch_name', b.name,
    'table_name', t.table_name,
    'session_active', exists (
      select 1
      from public.table_order_sessions s
      where s.table_id = t.id
        and s.ended_at is null
    )
  )
  from public.dining_tables t
  join public.cafes c on c.id = t.cafe_id
  join public.branches b on b.id = t.branch_id and b.cafe_id = t.cafe_id
  where p_token ~ '^[0-9a-fA-F]{64}$'
    and t.qr_token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and t.active = true
    and b.active = true
    and c.status = 'approved'
  limit 1;
$function$;
