-- Add missing workflow fields and make product reservations stock-safe.
ALTER TABLE public.cubes ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cube_id integer REFERENCES public.cubes(cube_id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS renter_id integer REFERENCES public.users(user_id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'Cash';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS listed_quantity integer;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method IN ('Cash', 'Online'));

CREATE OR REPLACE FUNCTION public.reserve_product_for_customer(
  p_product_id integer,
  p_customer_id integer,
  p_hours integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
  v_reserved integer;
  v_reservation_id integer;
BEGIN
  IF p_hours < 1 OR p_hours > 4 THEN
    RAISE EXCEPTION 'Reservation length must be between 1 and 4 hours.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = p_customer_id
      AND role = 'Customer'
      AND deleted_at IS NULL
      AND coalesce(status, 'Active') <> 'Resigned'
  ) THEN
    RAISE EXCEPTION 'A valid customer account is required.';
  END IF;

  SELECT stock_quantity INTO v_stock
  FROM public.products
  WHERE product_id = p_product_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product is no longer available.';
  END IF;

  UPDATE public.reservations
  SET status = 'Cancelled'
  WHERE product_id = p_product_id
    AND status = 'Pending'
    AND expiry_time <= now();

  SELECT count(*) INTO v_reserved
  FROM public.reservations
  WHERE product_id = p_product_id
    AND status IN ('Pending', 'Confirmed');

  IF v_reserved >= v_stock THEN
    RAISE EXCEPTION 'This product or shade is fully reserved.';
  END IF;

  INSERT INTO public.reservations (product_id, customer_id, expiry_time, hours_valid, status)
  VALUES (p_product_id, p_customer_id, now() + make_interval(hours => p_hours), p_hours, 'Pending')
  RETURNING reservation_id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_product_for_customer(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_product_for_customer(integer, integer, integer) TO anon, authenticated;