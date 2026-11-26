-- Update subscription catalogue and server-side plan validity.
-- Legacy price combinations remain accepted so already-submitted requests can still be reviewed.

alter table public.subscription_payment_requests drop constraint if exists subscription_payment_requests_amount_paise_check;
alter table public.subscription_payment_requests add constraint subscription_payment_requests_amount_paise_check
  check (amount_paise = any (array[89900,129900,199900,299900,499900,699900,69900,99900,149900,199900]));

alter table public.subscription_payment_requests drop constraint if exists subscription_payment_requests_plan_code_check;
alter table public.subscription_payment_requests add constraint subscription_payment_requests_plan_code_check
  check (plan_code = any (array['1_month','3_months','6_months','9_months','1_year','2_years','lifetime']));

alter table public.subscription_payment_requests drop constraint if exists subscription_payment_requests_plan_price_match;
alter table public.subscription_payment_requests add constraint subscription_payment_requests_plan_price_match check (
  (plan_code='1_month' and amount_paise=89900) or
  (plan_code='3_months' and amount_paise in (129900,69900)) or
  (plan_code='6_months' and amount_paise in (199900,99900)) or
  (plan_code='9_months' and amount_paise in (299900,149900)) or
  (plan_code='1_year' and amount_paise in (499900,199900)) or
  (plan_code='2_years' and amount_paise=699900) or
  (plan_code='lifetime' and amount_paise=499900)
);

alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
alter table public.subscriptions add constraint subscriptions_plan_code_check
  check (plan_code = any (array['1_month','3_months','6_months','9_months','1_year','2_years','lifetime']));

alter table public.subscriptions drop constraint if exists lifetime_has_no_expiry;
alter table public.subscriptions add constraint subscription_expiry_matches_plan check (
  (plan_code='lifetime' and expires_at is null) or
  (plan_code<>'lifetime' and expires_at is not null)
);

create or replace function public.review_subscription_payment(request_id uuid, decision text, note text default null)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  payment_row public.subscription_payment_requests%rowtype;
  new_expiry timestamptz;
begin
  if not public.is_super_admin() then raise exception 'Not authorized to review payment requests'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into payment_row from public.subscription_payment_requests where id=request_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if payment_row.status <> 'pending' then raise exception 'This payment request has already been reviewed'; end if;
  update public.subscription_payment_requests
    set status=decision, admin_note=nullif(left(trim(coalesce(note,'')),500),''), reviewed_at=now()
    where id=request_id;
  if decision='approved' then
    new_expiry := case payment_row.plan_code
      when '1_month' then now()+interval '1 month'
      when '3_months' then now()+interval '3 months'
      when '6_months' then now()+interval '6 months'
      when '9_months' then now()+interval '9 months'
      when '1_year' then now()+interval '1 year'
      when '2_years' then now()+interval '2 years'
      when 'lifetime' then null
      else null
    end;
    if payment_row.plan_code not in ('1_month','3_months','6_months','9_months','1_year','2_years','lifetime') then
      raise exception 'Unsupported subscription plan';
    end if;
    insert into public.subscriptions(user_id,payment_request_id,plan_code,starts_at,expires_at,status)
    values(payment_row.user_id,payment_row.id,payment_row.plan_code,now(),new_expiry,'active');
  end if;
end;
$function$;
