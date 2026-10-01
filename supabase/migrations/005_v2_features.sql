-- Migration: V2 Feature Updates for TrackErentory
-- Run this in Supabase SQL Editor

-- ═══════ 1. CUBES: image, dimensions, soft-delete ═══════
ALTER TABLE public.cubes ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.cubes ADD COLUMN IF NOT EXISTS width_cm numeric(8,2);
ALTER TABLE public.cubes ADD COLUMN IF NOT EXISTS height_cm numeric(8,2);
ALTER TABLE public.cubes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ═══════ 2. PRODUCTS: soft-delete ═══════
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ═══════ 3. USERS: staff contact info ═══════
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number varchar;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS social_link varchar;

-- ═══════ 4. OTP_CODES: add 'login' purpose for 2FA ═══════
ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;
ALTER TABLE public.otp_codes ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose::text = ANY (ARRAY[
    'verify'::character varying,
    'forgot_password'::character varying,
    'create_account'::character varying,
    'login'::character varying
  ]::text[]));

-- ═══════ 5. RESERVATIONS: support cube reservations ═══════
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS cube_id integer REFERENCES public.cubes(cube_id);

-- ═══════ 6. GRANT PERMISSIONS ═══════
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cubes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cubes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
