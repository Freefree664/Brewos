-- BrewOS table QR foundation.
-- A QR token identifies a table; it does not authorize guest orders.

create or replace function public.create_dining_table_with_qr(
  p_cafe_id uuid,
  p_branch_id uuid,
  p_table_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_table_id uuid;
  v_name text;
begin
  v_name := pg_catalog.btrim(coalesce(p_table_name, ''));

  if p_cafe_id is null or p_branch_id is null then
    raise exception 'Restaurant and branch are required.';
  end if;

  if v_name = '' or pg_catalog.length(v_name) > 60 then
    raise exception 'Table name must contain 1 to 60 characters.';
  end if;

  if not public.has_cafe_role(
    p_cafe_id,
    array['owner','manager']::public.cafe_role[]
  ) then
    raise exception 'You do not have permission to manage tables.';
  end if;

  if not exists (
    select 1
    from public.cafes c
    join public.branches b on b.cafe_id = c.id
    where c.id = p_cafe_id
      and c.status = 'approved'
      and b.id = p_branch_id
      and b.active = true
  ) then
    raise exception 'The approved restaurant or active branch could not be found.';
  end if;

  -- The raw token is returned once for QR creation; only its SHA-256 hash is stored.
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.dining_tables (
    cafe_id,
    branch_id,
    table_name,
    qr_token_hash,
    active
  )
  values (
    p_cafe_id,
    p_branch_id,
    v_name,
    pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex'),
    true
  )
  returning id into v_table_id;

  return pg_catalog.jsonb_build_object(
    'id', v_table_id,
    'table_name', v_name,
    'qr_token', v_token
  );
end;
$$;

revoke all on function public.create_dining_table_with_qr(uuid, uuid, text) from public;
grant execute on function public.create_dining_table_with_qr(uuid, uuid, text) to authenticated;
