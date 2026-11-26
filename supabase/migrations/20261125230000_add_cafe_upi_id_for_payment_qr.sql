alter table public.cafes add column if not exists upi_id text;

comment on column public.cafes.upi_id is 'Restaurant-owned UPI ID used to generate customer payment QR codes.';
