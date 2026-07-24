-- Database schema for TrackErentory
-- Create these tables in Supabase or Postgres.

create table if not exists users (
  user_id serial primary key,
  full_name text not null,
  username text not null unique,
  password text not null,
  role text not null check (role in ('Owner', 'Staff', 'Renter', 'Customer')),
  status text not null default 'Active',
  salary numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table if not exists cubes (
  cube_id serial primary key,
  cube_number text not null unique,
  type text not null check (type in ('Display', 'Pick-up')),
  price_per_month numeric(12,2) not null default 0,
  status text not null check (status in ('Available', 'Occupied')) default 'Available',
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
  created_at timestamptz default now()
);

create table if not exists reservations (
  reservation_id serial primary key,
  product_id integer references products(product_id) on delete cascade,
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
  buyer_name text,
  authorized_pickup_name text,
  payment_status text not null check (payment_status in ('Pending', 'Paid')) default 'Pending',
  receipt_image_url text,
  notes text,
  transaction_date timestamptz default now(),
  processed_by integer references users(user_id) on delete set null
);

grant select, insert, update, delete on users to authenticated;
grant select, insert, update, delete on cubes to authenticated;
grant select, insert, update, delete on products to authenticated;
grant select, insert, update, delete on reservations to authenticated;
grant select, insert, update, delete on contracts to authenticated;
grant select, insert, update, delete on transactions to authenticated;
