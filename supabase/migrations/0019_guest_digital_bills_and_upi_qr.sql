-- Include the final digital bill in the QR-token-scoped guest order status response.
-- The table QR token remains the authorization boundary for this public RPC.
create or replace function public.get_guest_order_status(p_token text,p_order_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'order_id',o.id,
    'order_number',o.order_number,
    'status',o.status,
    'updated_at',o.updated_at,
    'subtotal_paise',o.subtotal_paise,
    'discount_paise',coalesce(o.discount_paise,0),
    'tax_paise',o.tax_paise,
    'total_paise',o.total_paise,
    'restaurant_name',c.name,
    'upi_id',c.upi_id,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',oi.item_name_snapshot,
        'quantity',oi.quantity,
        'unit_price_paise',oi.unit_price_paise,
        'line_total_paise',oi.line_total_paise
      ) order by oi.created_at)
      from public.order_items oi where oi.order_id=o.id
    ),'[]'::jsonb)
  )
  from public.orders o
  join public.dining_tables t on t.id=o.table_id
  join public.cafes c on c.id=o.cafe_id
  where o.id=p_order_id
    and t.qr_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and t.active=true
  limit 1;
$function$;
