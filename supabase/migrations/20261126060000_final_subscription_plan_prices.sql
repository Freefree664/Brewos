begin;

-- Final customer-facing Rivantoq subscription catalogue.
-- Keep historical plan/amount pairs valid so previously submitted payment
-- requests remain reviewable and can still be approved or rejected.
alter table public.subscription_payment_requests
  drop constraint if exists subscription_payment_requests_amount_paise_check;
alter table public.subscription_payment_requests
  add constraint subscription_payment_requests_amount_paise_check
  check (amount_paise = any (array[
    89900,129900,199900,299900,499900,699900,69900,99900,149900,
    109900,189900,239900,369900,599900,
    259900,399900,409900,799900,899900
  ]));

alter table public.subscription_payment_requests
  drop constraint if exists subscription_payment_requests_plan_price_match;
alter table public.subscription_payment_requests
  add constraint subscription_payment_requests_plan_price_match check (
    (plan_code='1_month' and amount_paise in (89900,109900,199900)) or
    (plan_code='3_months' and amount_paise in (129900,69900,189900,259900)) or
    (plan_code='6_months' and amount_paise in (199900,99900,239900,399900)) or
    (plan_code='9_months' and amount_paise in (299900,149900,369900,409900)) or
    (plan_code='1_year' and amount_paise in (499900,199900,599900,799900)) or
    (plan_code='2_years' and amount_paise in (699900,899900)) or
    (plan_code='lifetime' and amount_paise=499900)
  );

commit;