-- Restrict owner/staff-only SECURITY DEFINER helpers to signed-in callers.
-- Public guest access is intentionally retained only for the guest-safe menu,
-- QR lookup, and PIN-protected order submission RPCs.

revoke all on function public.has_cafe_role(uuid, public.cafe_role[]) from public, anon;
grant execute on function public.has_cafe_role(uuid, public.cafe_role[]) to authenticated, service_role;

revoke all on function public.is_cafe_member(uuid) from public, anon;
grant execute on function public.is_cafe_member(uuid) to authenticated, service_role;

revoke all on function public.create_cafe_with_owner(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_cafe_with_owner(text, text, text, text, text, text) to authenticated, service_role;

revoke all on function public.create_dining_table_with_qr(uuid, uuid, text) from public, anon;
grant execute on function public.create_dining_table_with_qr(uuid, uuid, text) to authenticated, service_role;

-- rls_auto_enable is an internal event-trigger function, never an app RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
