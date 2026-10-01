-- Database schema for TrackErentory
-- Create these tables in Supabase or Postgres.

create table if not exists users (
  user_id serial primary key,
  full_name text not null,
  username text not null unique,
  password text not null,
  email varchar,
  role text not null check (role in ('Owner', 'Staff', 'Renter', 'Customer')),
  status text not null default 'Active',
  salary numeric(12,2) default 0,
  phone_number varchar,
  social_link varchar,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists cubes (
  cube_id serial primary key,
  cube_number text not null unique,
  location text,
  type text not null check (type in ('Display', 'Pick-up')),
  price_per_month numeric(12,2) not null default 0,
  status text not null check (status in ('Available', 'Occupied')) default 'Available',
  image_url text,
  width_cm numeric(8,2),
  height_cm numeric(8,2),
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists products (
  product_id serial primary key,
  renter_id integer references users(user_id) on delete set null,
  cube_id integer references cubes(cube_id) on delete set null,
  product_name text not null,
  description text,
  price numeric(12,2) not null default 0,
  stock_quantity integer not null default 0,
  variant text,
  image_url text,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists reservations (
  reservation_id serial primary key,
  product_id integer references products(product_id) on delete cascade,
  cube_id integer references cubes(cube_id),
  customer_id integer references users(user_id) on delete set null,
  expiry_time timestamptz not null,
  hours_valid integer not null default 1,
  status text not null check (status in ('Pending', 'Confirmed', 'Cancelled')) default 'Pending',
  created_at timestamptz default now()
);

create table if not exists contracts (
  contract_id serial primary key,
  renter_id integer references users(user_id) on delete set null,
  cube_id integer references cubes(cube_id) on delete set null,
  start_date date not null,
  end_date date not null,
  status text not null check (status in ('Active', 'Expired', 'Pending')) default 'Pending',
  created_at timestamptz default now()
);

create table if not exists transactions (
  transaction_id serial primary key,
  product_id integer references products(product_id) on delete set null,
  product_name text,
  cube_id integer references cubes(cube_id) on delete set null,
  renter_id integer references users(user_id) on delete set null,
  buyer_name text,
  authorized_pickup_name text,
  payment_status text not null check (payment_status in ('Pending', 'Paid')) default 'Pending',
  payment_method text not null check (payment_method in ('Cash', 'Online')) default 'Cash',
  quantity integer not null default 1,
  listed_quantity integer,
  pickup_status text not null check (pickup_status in ('Waiting', 'Picked-up')) default 'Waiting',
  receipt_image_url text,
  notes text,
  transaction_date timestamptz default now(),
  updated_at timestamptz not null default now(),
  processed_by integer references users(user_id) on delete set null
);

create table if not exists otp_codes (
  id serial primary key,
  user_id integer references users(user_id) on delete cascade,
  email varchar not null,
  code varchar(6) not null,
  purpose varchar not null check (purpose in ('verify', 'forgot_password', 'create_account', 'login')),
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

create or replace function public.reserve_product_for_customer(
  p_product_id integer,
  p_customer_id integer,
  p_hours integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_reserved integer;
  v_reservation_id integer;
begin
  if p_hours < 1 or p_hours > 4 then
    raise exception 'Reservation length must be between 1 and 4 hours.';
  end if;

  if not exists (
    select 1 from public.users
    where user_id = p_customer_id
      and role = 'Customer'
      and deleted_at is null
      and coalesce(status, 'Active') <> 'Resigned'
  ) then
    raise exception 'A valid customer account is required.';
  end if;

  select stock_quantity into v_stock
  from public.products
  where product_id = p_product_id and deleted_at is null
  for update;

  if not found then
    raise exception 'This product is no longer available.';
  end if;

  update public.reservations
  set status = 'Cancelled'
  where product_id = p_product_id
    and status = 'Pending'
    and expiry_time <= now();

  select count(*) into v_reserved
  from public.reservations
  where product_id = p_product_id
    and status in ('Pending', 'Confirmed');

  if v_reserved >= v_stock then
    raise exception 'This product or shade is fully reserved.';
  end if;

  insert into public.reservations (product_id, customer_id, expiry_time, hours_valid, status)
  values (p_product_id, p_customer_id, now() + make_interval(hours => p_hours), p_hours, 'Pending')
  returning reservation_id into v_reservation_id;

  return v_reservation_id;
end;
$$;

grant select, insert, update, delete on users to authenticated;
grant select, insert, update, delete on cubes to authenticated;
grant select, insert, update, delete on products to authenticated;
grant select, insert, update, delete on reservations to authenticated;
grant select, insert, update, delete on contracts to authenticated;
grant select, insert, update, delete on transactions to authenticated;
grant select, insert, update, delete on otp_codes to authenticated;
revoke all on function public.reserve_product_for_customer(integer, integer, integer) from public;
grant execute on function public.reserve_product_for_customer(integer, integer, integer) to anon, authenticated;
