-- Guest table PIN throttling. Review-only; do not apply until tested and approved.
begin;

alter table public.table_order_sessions
  add column if not exists failed_pin_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

-- Keep the validated existing order implementation private to this wrapper.
alter function public.submit_guest_order(text, text, jsonb, text, text, text)
  rename to submit_guest_order_unthrottled;

revoke all on function public.submit_guest_order_unthrottled(text, text, jsonb, text, text, text)
  from public, anon, authenticated;

-- Update the existing session-start RPC so restarting a table also resets the
-- new lockout state. It continues returning the PIN only to authorized staff.
create or replace function public.start_table_session(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_table public.dining_tables%rowtype;
  v_code text;
  v_random bytea;
  v_number bigint;
begin
  if auth.uid() is null then
    raise exception 'Please sign in as café staff.';
  end if;

  select *
  into v_table
  from public.dining_tables
  where id = p_table_id and active = true
  for update;

  if not found then
    raise exception 'This table is inactive.';
  end if;

  if not public.has_cafe_role(
    v_table.cafe_id,
    array['owner','manager','waiter']::public.cafe_role[]
  ) then
    raise exception 'You do not have permission to activate this table.';
  end if;

  v_random := extensions.gen_random_bytes(4);
  v_number := get_byte(v_random, 0)::bigint * 16777216
    + get_byte(v_random, 1)::bigint * 65536
    + get_byte(v_random, 2)::bigint * 256
    + get_byte(v_random, 3)::bigint;
  v_code := lpad((v_number % 1000000)::text, 6, '0');

  insert into public.table_order_sessions(
    table_id, access_code, started_by, started_at, ended_at,
    failed_pin_attempts, pin_locked_until
  )
  values (p_table_id, v_code, auth.uid(), now(), null, 0, null)
  on conflict (table_id) do update
    set access_code = excluded.access_code,
        started_by = excluded.started_by,
        started_at = now(),
        ended_at = null,
        failed_pin_attempts = 0,
        pin_locked_until = null;

  return jsonb_build_object('active', true, 'pin', v_code, 'started_at', now());
end;
$function$;

-- The current app submits all six named parameters. Keep the older four-
-- parameter form as a compatibility wrapper, but make both paths throttled.
create or replace function public.submit_guest_order(
  p_token text,
  p_pin text,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return public.submit_guest_order(p_token, p_pin, p_items, p_notes, null, null);
end;
$function$;

create or replace function public.submit_guest_order(
  p_token text,
  p_pin text,
  p_items jsonb,
  p_notes text,
  p_customer_name text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_session public.table_order_sessions%rowtype;
  v_table_id uuid;
  v_failed_attempts integer;
begin
  if coalesce(p_token, '') !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('error', 'Invalid table QR.');
  end if;

  select t.id
  into v_table_id
  from public.dining_tables t
  where t.qr_token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and t.active = true
  limit 1;

  if v_table_id is null then
    return jsonb_build_object('error', 'This table QR is invalid or inactive.');
  end if;

  select s.*
  into v_session
  from public.table_order_sessions s
  where s.table_id = v_table_id
    and s.ended_at is null
  for update;

  if not found then
    return jsonb_build_object('error', 'This table is not open for ordering yet. Please wait for café staff.');
  end if;

  if v_session.pin_locked_until is not null
     and v_session.pin_locked_until > pg_catalog.now() then
    return jsonb_build_object('error', 'Too many incorrect codes. Please ask café staff to reset the table session.');
  end if;

  if coalesce(p_pin, '') !~ '^[0-9]{6}$'
     or v_session.access_code <> p_pin then
    v_failed_attempts := case
      when v_session.pin_locked_until is not null
           and v_session.pin_locked_until <= pg_catalog.now() then 1
      else v_session.failed_pin_attempts + 1
    end;

    update public.table_order_sessions
    set failed_pin_attempts = v_failed_attempts,
        pin_locked_until = case
          when v_failed_attempts >= 5
            then pg_catalog.now() + interval '10 minutes'
          else null
        end
    where id = v_session.id;

    return jsonb_build_object(
      'error',
      case
        when v_failed_attempts >= 5
          then 'Too many incorrect codes. Please ask café staff to reset the table session.'
        else 'The six-digit code is incorrect. Please check with café staff.'
      end
    );
  end if;

  update public.table_order_sessions
  set failed_pin_attempts = 0,
      pin_locked_until = null
  where id = v_session.id;

  return public.submit_guest_order_unthrottled(
    p_token, p_pin, p_items, p_notes, p_customer_name, p_customer_phone
  );
end;
$function$;

revoke all on function public.submit_guest_order(text, text, jsonb, text)
  from public;
revoke all on function public.submit_guest_order(text, text, jsonb, text, text, text)
  from public;
grant execute on function public.submit_guest_order(text, text, jsonb, text)
  to anon, authenticated, service_role;
grant execute on function public.submit_guest_order(text, text, jsonb, text, text, text)
  to anon, authenticated, service_role;

commit;
