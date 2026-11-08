-- ==============================================================================
-- Migration 018: Online cube payment (reference no. + receipt), contract agreement
-- acceptance, and inventory stock in / stock out tracking.
-- Run this once in the Supabase SQL Editor.
-- ==============================================================================

-- ── 1. Contract agreement: record when the renter accepted the terms ─────────
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS renter_agreed_at timestamptz;

-- ── 2. Cube payments: online reference number, receipt, verification state ──
ALTER TABLE public.contract_payments ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE public.contract_payments ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Default mode of payment is Cash
ALTER TABLE public.contract_payments ALTER COLUMN payment_method SET DEFAULT 'Cash';

-- Allow the 'For Verification' state (renter paid online, waiting for Owner/Staff)
ALTER TABLE public.contract_payments DROP CONSTRAINT IF EXISTS contract_payments_payment_status_check;
ALTER TABLE public.contract_payments ADD CONSTRAINT contract_payments_payment_status_check
  CHECK (payment_status IN ('Pending', 'For Verification', 'Paid'));

CREATE INDEX IF NOT EXISTS idx_contract_payments_status ON public.contract_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_contract_payments_renter ON public.contract_payments(renter_id);

-- ── 3. Inventory: stock in / stock out ledger ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  movement_id serial PRIMARY KEY,
  product_id integer REFERENCES public.products(product_id) ON DELETE SET NULL,
  renter_id integer REFERENCES public.users(user_id) ON DELETE SET NULL,
  cube_id integer REFERENCES public.cubes(cube_id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('Stock In', 'Stock Out')),
  quantity integer NOT NULL CHECK (quantity > 0),
  previous_quantity integer NOT NULL DEFAULT 0,
  new_quantity integer NOT NULL DEFAULT 0,
  product_name text NOT NULL,
  variant text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_renter ON public.stock_movements(renter_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);

-- Every change to products.stock_quantity is logged automatically:
--   new product            → Stock In  (initial quantity)
--   quantity increased     → Stock In  (restock / returned sale)
--   quantity decreased     → Stock Out (sold / pulled out / adjusted)
CREATE OR REPLACE FUNCTION public.log_product_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old integer := 0;
  v_new integer := coalesce(NEW.stock_quantity, 0);
  v_diff integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := coalesce(OLD.stock_quantity, 0);
  END IF;

  v_diff := v_new - v_old;
  IF v_diff = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, renter_id, cube_id, movement_type, quantity,
    previous_quantity, new_quantity, product_name, variant, unit_price, image_url
  ) VALUES (
    NEW.product_id, NEW.renter_id, NEW.cube_id,
    CASE WHEN v_diff > 0 THEN 'Stock In' ELSE 'Stock Out' END,
    abs(v_diff), v_old, v_new,
    NEW.product_name, NEW.variant, coalesce(NEW.price, 0),
    coalesce(NEW.image_url, (NEW.image_urls)[1])
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_stock_movement ON public.products;
CREATE TRIGGER trg_products_stock_movement
  AFTER INSERT OR UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_stock_movement();

-- Backfill: existing products get an opening "Stock In" entry dated at product creation
INSERT INTO public.stock_movements (
  product_id, renter_id, cube_id, movement_type, quantity,
  previous_quantity, new_quantity, product_name, variant, unit_price, image_url, created_at
)
SELECT p.product_id, p.renter_id, p.cube_id, 'Stock In', p.stock_quantity,
       0, p.stock_quantity, p.product_name, p.variant, coalesce(p.price, 0),
       coalesce(p.image_url, (p.image_urls)[1]), coalesce(p.created_at, now())
FROM public.products p
WHERE p.stock_quantity > 0
  AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.product_id = p.product_id);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all actions on stock_movements to authenticated" ON public.stock_movements;
CREATE POLICY "Allow all actions on stock_movements to authenticated"
  ON public.stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read stock_movements" ON public.stock_movements;
CREATE POLICY "Allow anon read stock_movements"
  ON public.stock_movements FOR SELECT TO anon USING (true);

GRANT ALL ON public.stock_movements TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.stock_movements_movement_id_seq TO anon, authenticated;
