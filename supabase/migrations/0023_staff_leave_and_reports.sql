-- Staff leave requests and auditable attendance reporting.
create table if not exists public.staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists staff_leave_requests_cafe_dates_idx on public.staff_leave_requests(cafe_id,starts_on,ends_on);
alter table public.staff_leave_requests enable row level security;
create policy "Cafe managers manage staff leave" on public.staff_leave_requests for all to authenticated
using (public.has_cafe_role(cafe_id,array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id,array['owner','manager']::public.cafe_role[]));
