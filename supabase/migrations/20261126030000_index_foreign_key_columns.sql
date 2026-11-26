-- Cover the foreign-key columns identified by the Supabase performance advisor.
-- These indexes improve joins and avoid expensive scans when referenced rows change.
-- Review and apply with the related pre-launch migrations; this file has not been
-- run against the production database.
begin;

create index if not exists cafes_created_by_fk_idx
  on public.cafes (created_by);
create index if not exists customer_loyalty_ledger_cafe_id_fk_idx
  on public.customer_loyalty_ledger (cafe_id);
create index if not exists dining_tables_assigned_waiter_id_fk_idx
  on public.dining_tables (assigned_waiter_id);
create index if not exists dining_tables_branch_id_cafe_id_fk_idx
  on public.dining_tables (branch_id, cafe_id);
create index if not exists menu_categories_branch_id_cafe_id_fk_idx
  on public.menu_categories (branch_id, cafe_id);
create index if not exists menu_categories_cafe_id_fk_idx
  on public.menu_categories (cafe_id);
create index if not exists menu_items_branch_id_cafe_id_fk_idx
  on public.menu_items (branch_id, cafe_id);
create index if not exists menu_items_category_id_fk_idx
  on public.menu_items (category_id);
create index if not exists order_items_cafe_id_fk_idx
  on public.order_items (cafe_id);
create index if not exists order_items_menu_item_id_fk_idx
  on public.order_items (menu_item_id);
create index if not exists order_payments_cafe_id_fk_idx
  on public.order_payments (cafe_id);
create index if not exists orders_branch_id_cafe_id_fk_idx
  on public.orders (branch_id, cafe_id);
create index if not exists orders_created_by_fk_idx
  on public.orders (created_by);
create index if not exists orders_table_id_fk_idx
  on public.orders (table_id);
create index if not exists staff_leave_requests_reviewed_by_fk_idx
  on public.staff_leave_requests (reviewed_by);
create index if not exists staff_leave_requests_staff_id_fk_idx
  on public.staff_leave_requests (staff_id);
create index if not exists staff_members_branch_id_fk_idx
  on public.staff_members (branch_id);
create index if not exists staff_shifts_branch_id_fk_idx
  on public.staff_shifts (branch_id);
create index if not exists staff_shifts_created_by_fk_idx
  on public.staff_shifts (created_by);
create index if not exists staff_shifts_staff_id_fk_idx
  on public.staff_shifts (staff_id);
create index if not exists table_order_pins_created_by_fk_idx
  on public.table_order_pins (created_by);
create index if not exists table_order_sessions_started_by_fk_idx
  on public.table_order_sessions (started_by);

commit;
