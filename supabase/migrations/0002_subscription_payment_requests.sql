-- BrewOS subscription payment requests
-- Customers can submit and read only their own requests.
-- Approval/rejection is performed by a trusted administrator through the Supabase dashboard
-- until a server-verified Super Admin role and admin interface are implemented.

create table if not exists public.subscription_payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('3_months','6_months','9_months','1_year','lifetime')),
  plan_name text not null,
  amount_paise integer not null check (amount_paise in (69900,99900,149900,199900,499900)),
  upi_transaction_ref text not null unique check (char_length(trim(upi_transaction_ref)) between 6 and 80),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_review_fields_consistent check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('approved','rejected') and reviewed_at is not null)
  )
);

create index if not exists subscription_payment_requests_user_created_idx
  on public.subscription_payment_requests(user_id, created_at desc);
create index if not exists subscription_payment_requests_status_created_idx
  on public.subscription_payment_requests(status, created_at desc);

alter table public.subscription_payment_requests enable row level security;

drop policy if exists "Customers read own payment requests" on public.subscription_payment_requests;
create policy "Customers read own payment requests"
  on public.subscription_payment_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Customers submit own payment requests" on public.subscription_payment_requests;
create policy "Customers submit own payment requests"
  on public.subscription_payment_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_at is null
    and admin_note is null
  );

revoke all on public.subscription_payment_requests from anon;
grant select, insert on public.subscription_payment_requests to authenticated;
