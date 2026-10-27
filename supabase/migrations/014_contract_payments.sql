-- Migration: 014_contract_payments.sql
-- Supports tracking monthly rental payments for multi-month cube contracts (e.g. 2, 3, 6, 12 months)

CREATE TABLE IF NOT EXISTS public.contract_payments (
  payment_id serial PRIMARY KEY,
  contract_id integer REFERENCES public.contracts(contract_id) ON DELETE CASCADE,
  renter_id integer REFERENCES public.users(user_id) ON DELETE SET NULL,
  cube_id integer REFERENCES public.cubes(cube_id) ON DELETE SET NULL,
  month_number integer NOT NULL DEFAULT 1,
  due_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0.00,
  payment_status text NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid')),
  payment_method text CHECK (payment_method IN ('Cash', 'Online')),
  receipt_image_url text,
  paid_at timestamptz,
  processed_by integer REFERENCES public.users(user_id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contract_month UNIQUE (contract_id, month_number)
);

-- Row-Level Security
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contract_payments' AND policyname = 'Allow all actions on contract_payments to authenticated'
  ) THEN
    CREATE POLICY "Allow all actions on contract_payments to authenticated"
      ON public.contract_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contract_payments' AND policyname = 'Allow anon read contract_payments'
  ) THEN
    CREATE POLICY "Allow anon read contract_payments"
      ON public.contract_payments FOR SELECT TO anon USING (true);
  END IF;
END $$;

GRANT ALL ON public.contract_payments TO authenticated, anon;
