alter table public.cafes drop constraint if exists cafes_upi_id_format;

-- PostgreSQL's regex engine limits bounded repetitions to 255.
alter table public.cafes
  add constraint cafes_upi_id_format
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9.-]{2,64}$');
