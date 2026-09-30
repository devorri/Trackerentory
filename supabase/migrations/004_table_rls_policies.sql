-- =====================================================
-- RLS Policies for ALL tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- =====================================================

-- 1) PRODUCTS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;
DROP POLICY IF EXISTS "products_delete" ON public.products;

CREATE POLICY "products_select" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "products_delete" ON public.products FOR DELETE USING (true);

-- 2) USERS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

CREATE POLICY "users_select" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "users_delete" ON public.users FOR DELETE USING (true);

-- 3) CUBES
ALTER TABLE public.cubes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cubes_select" ON public.cubes;
DROP POLICY IF EXISTS "cubes_insert" ON public.cubes;
DROP POLICY IF EXISTS "cubes_update" ON public.cubes;
DROP POLICY IF EXISTS "cubes_delete" ON public.cubes;

CREATE POLICY "cubes_select" ON public.cubes FOR SELECT USING (true);
CREATE POLICY "cubes_insert" ON public.cubes FOR INSERT WITH CHECK (true);
CREATE POLICY "cubes_update" ON public.cubes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "cubes_delete" ON public.cubes FOR DELETE USING (true);

-- 4) CONTRACTS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;
DROP POLICY IF EXISTS "contracts_insert" ON public.contracts;
DROP POLICY IF EXISTS "contracts_update" ON public.contracts;
DROP POLICY IF EXISTS "contracts_delete" ON public.contracts;

CREATE POLICY "contracts_select" ON public.contracts FOR SELECT USING (true);
CREATE POLICY "contracts_insert" ON public.contracts FOR INSERT WITH CHECK (true);
CREATE POLICY "contracts_update" ON public.contracts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "contracts_delete" ON public.contracts FOR DELETE USING (true);

-- 5) RESERVATIONS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_select" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete" ON public.reservations;

CREATE POLICY "reservations_select" ON public.reservations FOR SELECT USING (true);
CREATE POLICY "reservations_insert" ON public.reservations FOR INSERT WITH CHECK (true);
CREATE POLICY "reservations_update" ON public.reservations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "reservations_delete" ON public.reservations FOR DELETE USING (true);

-- 6) TRANSACTIONS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE USING (true);

-- 7) OTP_CODES
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "otp_codes_select" ON public.otp_codes;
DROP POLICY IF EXISTS "otp_codes_insert" ON public.otp_codes;
DROP POLICY IF EXISTS "otp_codes_update" ON public.otp_codes;
DROP POLICY IF EXISTS "otp_codes_delete" ON public.otp_codes;

CREATE POLICY "otp_codes_select" ON public.otp_codes FOR SELECT USING (true);
CREATE POLICY "otp_codes_insert" ON public.otp_codes FOR INSERT WITH CHECK (true);
CREATE POLICY "otp_codes_update" ON public.otp_codes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "otp_codes_delete" ON public.otp_codes FOR DELETE USING (true);
