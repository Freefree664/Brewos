CREATE OR REPLACE FUNCTION public.get_public_table_info(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'restaurant_name', c.name,
    'branch_name', b.name,
    'table_name', t.table_name,
    'session_active', exists (
      select 1
      from public.table_order_sessions s
      where s.table_id = t.id and s.ended_at is null
    ),
    'cafe_slug', c.slug,
    'branch_id', b.id
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

CREATE OR REPLACE FUNCTION public.get_public_cafe_menu(p_slug text, p_branch_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
WITH selected AS (
  SELECT c.id, c.name, c.description, c.logo_url,
         b.id AS branch_id, b.name AS branch_name, b.address AS branch_address
  FROM public.cafes c
  JOIN public.branches b ON b.cafe_id = c.id AND b.active = true
  WHERE c.slug = lower(trim(p_slug))
    AND c.status = 'approved'
    AND (p_branch_id IS NULL OR b.id = p_branch_id)
  ORDER BY b.created_at
  LIMIT 1
)
SELECT pg_catalog.jsonb_build_object(
  'id', c.id,
  'name', c.name,
  'description', c.description,
  'logo_url', c.logo_url,
  'branch', pg_catalog.jsonb_build_object(
    'id', c.branch_id,
    'name', c.branch_name,
    'address', c.branch_address
  ),
  'categories', coalesce((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', mc.id,
        'name', mc.name,
        'items', (
          SELECT coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', mi.id,
              'name', mi.name,
              'description', mi.description,
              'image_url', mi.image_url,
              'price_paise', mi.price_paise,
              'option_groups', coalesce((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'id', g.id,
                    'name', g.name,
                    'required', g.required,
                    'min_select', g.min_select,
                    'max_select', g.max_select,
                    'options', (
                      SELECT coalesce(pg_catalog.jsonb_agg(
                        pg_catalog.jsonb_build_object(
                          'id', o.id,
                          'name', o.name,
                          'extra_price_paise', o.extra_price_paise
                        ) ORDER BY o.sort_order, o.name
                      ), '[]'::jsonb)
                      FROM public.menu_item_options o
                      WHERE o.group_id = g.id AND o.active = true
                    )
                  ) ORDER BY g.sort_order, g.name
                )
                FROM public.menu_item_option_groups g
                WHERE g.menu_item_id = mi.id
                  AND g.cafe_id = c.id
                  AND g.active = true
              ), '[]'::jsonb)
            ) ORDER BY mi.sort_order, mi.name
          ), '[]'::jsonb)
          FROM public.menu_items mi
          WHERE mi.category_id = mc.id
            AND mi.cafe_id = c.id
            AND mi.is_available = true
            AND (mi.branch_id IS NULL OR mi.branch_id = c.branch_id)
        )
      ) ORDER BY mc.sort_order, mc.name
    )
    FROM public.menu_categories mc
    WHERE mc.cafe_id = c.id
      AND mc.active = true
      AND (mc.branch_id IS NULL OR mc.branch_id = c.branch_id)
  ), '[]'::jsonb)
)
FROM selected c;
$function$;

REVOKE ALL ON FUNCTION public.get_public_table_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_table_info(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_cafe_menu(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_cafe_menu(text, uuid) TO anon, authenticated;