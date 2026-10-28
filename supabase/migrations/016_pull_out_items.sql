-- ==============================================================================
-- Migration 016: Pull Out Items & Pickup Status Update
-- Run this in your Supabase SQL Editor to update your database schema.
-- ==============================================================================

-- 1. Create the pull_out_items table
CREATE TABLE IF NOT EXISTS public.pull_out_items (
  pull_out_id serial PRIMARY KEY,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['Display'::character varying, 'Pick-up'::character varying]::text[])),
  product_id integer,
  cube_id integer,
  renter_id integer,
  transaction_id integer,
  buyer_name character varying,
  product_name character varying NOT NULL,
  price numeric DEFAULT 0.00,
  quantity integer NOT NULL DEFAULT 1,
  reason character varying DEFAULT 'Contract Expired'::character varying,
  status character varying DEFAULT 'Pull Out'::character varying,
  notes text,
  pulled_out_by integer,
  pulled_out_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pull_out_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE SET NULL,
  CONSTRAINT pull_out_items_cube_id_fkey FOREIGN KEY (cube_id) REFERENCES public.cubes(cube_id) ON DELETE SET NULL,
  CONSTRAINT pull_out_items_renter_id_fkey FOREIGN KEY (renter_id) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT pull_out_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(transaction_id) ON DELETE SET NULL,
  CONSTRAINT pull_out_items_pulled_out_by_fkey FOREIGN KEY (pulled_out_by) REFERENCES public.users(user_id) ON DELETE SET NULL
);

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_pull_out_items_type ON public.pull_out_items(type);
CREATE INDEX IF NOT EXISTS idx_pull_out_items_renter ON public.pull_out_items(renter_id);
CREATE INDEX IF NOT EXISTS idx_pull_out_items_cube ON public.pull_out_items(cube_id);

-- 3. (Optional but recommended) Allow 'Pulled Out' in transactions.pickup_status constraint
DO $$
BEGIN
  ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_pickup_status_check;
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_pickup_status_check
    CHECK (pickup_status::text = ANY (ARRAY['Waiting'::character varying, 'Picked-up'::character varying, 'Pulled Out'::character varying]::text[]));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 4. Grant table & sequence access
GRANT ALL ON public.pull_out_items TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE pull_out_items_pull_out_id_seq TO anon, authenticated;
