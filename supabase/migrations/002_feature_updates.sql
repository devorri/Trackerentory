-- Migration: Feature updates for TrackErentory
-- Run this in Supabase SQL Editor

-- 1. Add email to users (for OTP verification & forgot password)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email varchar;

-- 2. Add hours_valid to reservations (code already references it)
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS hours_valid integer DEFAULT 1;

-- 3. Add pickup_status to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS pickup_status varchar
  DEFAULT 'Waiting'
  CHECK (pickup_status IN ('Waiting', 'Picked-up'));

-- 4. Add contract_text to contracts (owner-editable terms)
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS contract_text text;

-- 5. OTP codes table
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id serial PRIMARY KEY,
  user_id integer REFERENCES public.users(user_id) ON DELETE CASCADE,
  email varchar NOT NULL,
  code varchar(6) NOT NULL,
  purpose varchar NOT NULL CHECK (purpose IN ('verify', 'forgot_password', 'create_account')),
  expires_at timestamp NOT NULL,
  used boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_codes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_codes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE otp_codes_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE otp_codes_id_seq TO authenticated;
