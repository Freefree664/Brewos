-- BrewOS operations suite: staff, shifts, attendance, waiter assignment and customer loyalty.
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 1 and 100),
  phone text,
  role text not null check (role in ('waiter','kitchen','manager','cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists staff_members_cafe_branch_idx on public.staff_members(cafe_id,branch_id,active);
alter table public.staff_members enable row level security;
create policy "Cafe managers manage staff" on public.staff_members for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists staff_shifts_cafe_start_idx on public.staff_shifts(cafe_id,starts_at);
alter table public.staff_shifts enable row level security;
create policy "Cafe managers manage shifts" on public.staff_shifts for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at > check_in_at)
);
create index if not exists staff_attendance_cafe_checkin_idx on public.staff_attendance(cafe_id,check_in_at desc);
create unique index if not exists staff_attendance_one_open_shift_idx on public.staff_attendance(staff_id) where check_out_at is null;
alter table public.staff_attendance enable row level security;
create policy "Cafe managers manage attendance" on public.staff_attendance for all to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

alter table public.dining_tables add column if not exists assigned_waiter_id uuid references public.staff_members(id) on delete set null;

create table if not exists public.customer_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  points_balance integer not null default 0 check (points_balance >= 0),
  total_orders integer not null default 0 check (total_orders >= 0),
  total_spend_paise bigint not null default 0 check (total_spend_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cafe_id,customer_phone)
);
create index if not exists loyalty_accounts_cafe_updated_idx on public.customer_loyalty_accounts(cafe_id,updated_at desc);
alter table public.customer_loyalty_accounts enable row level security;
create policy "Cafe managers read loyalty accounts" on public.customer_loyalty_accounts for select to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));
create policy "Cafe managers update loyalty accounts" on public.customer_loyalty_accounts for update to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]))
with check (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create table if not exists public.customer_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  account_id uuid not null references public.customer_loyalty_accounts(id) on delete cascade,
  order_id uuid unique references public.orders(id) on delete set null,
  points_delta integer not null check (points_delta <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_ledger_account_created_idx on public.customer_loyalty_ledger(account_id,created_at desc);
alter table public.customer_loyalty_ledger enable row level security;
create policy "Cafe managers read loyalty ledger" on public.customer_loyalty_ledger for select to authenticated
using (public.has_cafe_role(cafe_id, array['owner','manager']::public.cafe_role[]));

create or replace function public.award_customer_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_points integer;
  v_name text;
  v_phone text;
  v_is_completed_transition boolean := false;
begin
  if tg_op = 'INSERT' then
    v_is_completed_transition := new.status = 'completed';
  else
    v_is_completed_transition := new.status = 'completed' and old.status is distinct from 'completed';
  end if;
  if v_is_completed_transition and nullif(trim(coalesce(new.customer_phone,'')),'') is not null then
    v_phone := left(trim(new.customer_phone),20);
    v_name := coalesce(nullif(left(trim(coalesce(new.customer_name,'')),100),''),'Guest');
    v_points := floor(greatest(new.total_paise,0)::numeric / 1000)::integer;
    insert into public.customer_loyalty_accounts(cafe_id,customer_name,customer_phone,total_orders,total_spend_paise,updated_at)
    values(new.cafe_id,v_name,v_phone,1,greatest(new.total_paise,0),now())
    on conflict(cafe_id,customer_phone) do update
    set customer_name=excluded.customer_name,
        total_orders=public.customer_loyalty_accounts.total_orders+1,
        total_spend_paise=public.customer_loyalty_accounts.total_spend_paise+excluded.total_spend_paise,
        updated_at=now()
    returning id into v_account_id;
    if v_points > 0 then
      insert into public.customer_loyalty_ledger(cafe_id,account_id,order_id,points_delta,reason)
      values(new.cafe_id,v_account_id,new.id,v_points,'Earned on completed order')
      on conflict(order_id) do nothing;
      if found then
        update public.customer_loyalty_accounts
        set points_balance=points_balance+v_points,updated_at=now()
        where id=v_account_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_award_loyalty_points on public.orders;
create trigger orders_award_loyalty_points
after insert or update of status on public.orders
for each row execute function public.award_customer_loyalty_points();
revoke all on function public.award_customer_loyalty_points() from public,anon,authenticated;

create or replace function public.redeem_customer_loyalty_points(p_account_id uuid,p_points integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cafe_id uuid;
  v_balance integer;
  v_balance_after integer;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if p_points is null or p_points <= 0 then raise exception 'Enter a positive points amount.'; end if;
  select cafe_id,points_balance into v_cafe_id,v_balance
  from public.customer_loyalty_accounts where id=p_account_id for update;
  if v_cafe_id is null then raise exception 'Customer account not found.'; end if;
  if not public.has_cafe_role(v_cafe_id,array['owner','manager']::public.cafe_role[]) then
    raise exception 'You do not have permission to redeem points for this café.';
  end if;
  if p_points > v_balance then raise exception 'Not enough points available.'; end if;
  v_balance_after := v_balance-p_points;
  update public.customer_loyalty_accounts set points_balance=v_balance_after,updated_at=now() where id=p_account_id;
  insert into public.customer_loyalty_ledger(cafe_id,account_id,points_delta,reason)
  values(v_cafe_id,p_account_id,-p_points,'Redeemed at counter');
  return v_balance_after;
end;
$$;
revoke all on function public.redeem_customer_loyalty_points(uuid,integer) from public,anon;
grant execute on function public.redeem_customer_loyalty_points(uuid,integer) to authenticated;
