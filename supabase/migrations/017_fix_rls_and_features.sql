-- Migration 017: Ensure anon & authenticated roles have full CRUD access to contract_payments and contract_extensions
-- Run this in Supabase SQL Editor if RLS blocks direct inserts from the client anon key.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.contract_payments_payment_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS "Anon can manage contract_payments" ON public.contract_payments;
CREATE POLICY "Anon can manage contract_payments"
  ON public.contract_payments FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_extensions TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.contract_extensions_extension_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS "Anon can manage contract_extensions" ON public.contract_extensions;
CREATE POLICY "Anon can manage contract_extensions"
  ON public.contract_extensions FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

