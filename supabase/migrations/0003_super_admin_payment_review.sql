-- BrewOS trusted Super Admin review and subscription activation
-- Bootstrap the first administrator manually in Supabase SQL Editor after deployment:
-- insert into public.super_admins (user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
-- Never expose service_role keys in the browser.

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;
revoke all on public.super_admins from anon, authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.super_admins a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_request_id uuid not null unique references public.subscription_payment_requests(id),
  plan_code text not null check (plan_code in ('3_months','6_months','9_months','1_year','lifetime')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','cancelled')),
  created_at timestamptz not null default now(),
  constraint lifetime_has_no_expiry check (
    (plan_code = 'lifetime' and expires_at is null)
    or (plan_code <> 'lifetime' and expires_at is not null)
  )
);

create index if not exists subscriptions_user_status_idx
  on public.subscriptions(user_id, status, expires_at desc);

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;

drop policy if exists "Customers read own subscriptions" on public.subscriptions;
create policy "Customers read own subscriptions"
  on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Super admins read payment requests" on public.subscription_payment_requests;
create policy "Super admins read payment requests"
  on public.subscription_payment_requests for select to authenticated
  using (public.is_super_admin());

create or replace function public.review_subscription_payment(
  request_id uuid,
  decision text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.subscription_payment_requests%rowtype;
  new_expiry timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized to review payment requests';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into payment_row
  from public.subscription_payment_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;
  if payment_row.status <> 'pending' then
    raise exception 'This payment request has already been reviewed';
  end if;

  update public.subscription_payment_requests
  set status = decision,
      admin_note = nullif(left(trim(coalesce(note, '')), 500), ''),
      reviewed_at = now()
  where id = request_id;

  if decision = 'approved' then
    new_expiry := case payment_row.plan_code
      when '3_months' then now() + interval '3 months'
      when '6_months' then now() + interval '6 months'
      when '9_months' then now() + interval '9 months'
      when '1_year' then now() + interval '1 year'
      when 'lifetime' then null
    end;

    insert into public.subscriptions (
      user_id, payment_request_id, plan_code, starts_at, expires_at, status
    ) values (
      payment_row.user_id, payment_row.id, payment_row.plan_code, now(), new_expiry, 'active'
    );
  end if;
end;
$$;

revoke all on function public.review_subscription_payment(uuid, text, text) from public, anon;
grant execute on function public.review_subscription_payment(uuid, text, text) to authenticated;

-- Enforce the exact price for each plan at the database boundary.
alter table public.subscription_payment_requests
  drop constraint if exists subscription_payment_requests_plan_price_match;
alter table public.subscription_payment_requests
  add constraint subscription_payment_requests_plan_price_match check (
    (plan_code = '3_months' and amount_paise = 69900)
    or (plan_code = '6_months' and amount_paise = 99900)
    or (plan_code = '9_months' and amount_paise = 149900)
    or (plan_code = '1_year' and amount_paise = 199900)
    or (plan_code = 'lifetime' and amount_paise = 499900)
  );
