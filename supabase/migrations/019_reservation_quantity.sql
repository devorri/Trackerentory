-- Allow customers to reserve more than 1 piece of a product per reservation
alter table public.reservations
  add column if not exists quantity integer not null default 1;

alter table public.reservations
  drop constraint if exists reservations_quantity_check;
alter table public.reservations
  add constraint reservations_quantity_check check (quantity >= 1);
