-- Migration: 013_contract_extensions.sql
-- Supports cube contract extension requests from renters to be approved or declined by owner

CREATE TABLE IF NOT EXISTS public.contract_extensions (
  extension_id serial PRIMARY KEY,
  contract_id integer REFERENCES public.contracts(contract_id) ON DELETE CASCADE,
  renter_id integer REFERENCES public.users(user_id) ON DELETE CASCADE,
  cube_id integer REFERENCES public.cubes(cube_id) ON DELETE CASCADE,
  requested_months integer NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL CHECK (status IN ('Pending', 'Approved', 'Declined')) DEFAULT 'Pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS and permissions
ALTER TABLE public.contract_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all actions on contract_extensions to authenticated"
  ON public.contract_extensions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon read contract_extensions"
  ON public.contract_extensions
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_extensions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_extensions TO anon;
