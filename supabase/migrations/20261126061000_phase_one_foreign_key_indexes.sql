-- Cover Phase 1 foreign keys flagged by the Supabase performance advisor.
create index if not exists menu_item_option_groups_cafe_id_idx
  on public.menu_item_option_groups(cafe_id);
create index if not exists menu_item_options_cafe_id_idx
  on public.menu_item_options(cafe_id);
create index if not exists menu_item_options_group_cafe_idx
  on public.menu_item_options(group_id,cafe_id);
