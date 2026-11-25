-- Guest table PIN throttling. This migration is review-only until explicitly applied.
begin;

alter table public.table_order_sessions
  add column if not exists failed_pin_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

-- Preserve the existing validated order-creation implementation as a private
-- implementation function. All public guest ordering now passes through the
-- throttling wrapper below.
alter function public.submit_guest_order(text, text, jsonb, text, text, text)
  rename to submit_guest_order_unthrottled;

revoke all on function public.submit_guest_order_unthrottled(text, text, jsonb, text, text, text)
  from public, anon, authenticated;

-- The older four-argument overload is no longer used by the current customer
-- app. Remove its public execution path so it cannot bypass throttling.
revoke all on function public.submit_guest_order(text, text, jsonb, text)
  from public, anon, authenticated;

create or replace function public.submit_guest_order(
  p_token text,
  p_pin text,
  p_items jsonb,
  p_notes text default null,
  p_customer_name text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_session public.table_order_sessions%rowtype;
  v_table_id uuid;
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
    update public.table_order_sessions
    set failed_pin_attempts = case
          when pin_locked_until is not null and pin_locked_until <= pg_catalog.now() then 1
          else failed_pin_attempts + 1
        end,
        pin_locked_until = case
          when (case
            when pin_locked_until is not null and pin_locked_until <= pg_catalog.now() then 1
            else failed_pin_attempts + 1
          end) >= 5
          then pg_catalog.now() + interval '10 minutes'
          else null
        end
    where id = v_session.id;

    return jsonb_build_object(
      'error',
      case
        when (case
          when v_session.pin_locked_until is not null
               and v_session.pin_locked_until <= pg_catalog.now() then 1
          else v_session.failed_pin_attempts + 1
        end) >= 5
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

revoke all on function public.submit_guest_order(text, text, jsonb, text, text, text)
  from public;
grant execute on function public.submit_guest_order(text, text, jsonb, text, text, text)
  to anon, authenticated, service_role;

commit;
