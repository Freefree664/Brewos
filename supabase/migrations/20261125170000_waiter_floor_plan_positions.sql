alter table public.dining_tables
  add column if not exists floor_position integer not null default 0;

with ranked as (
  select id, row_number() over (partition by branch_id order by created_at,id) - 1 as position
  from public.dining_tables
)
update public.dining_tables t
set floor_position = ranked.position
from ranked
where ranked.id = t.id
  and t.floor_position = 0;

create index if not exists dining_tables_floor_position_idx
  on public.dining_tables (cafe_id, branch_id, floor_position);
