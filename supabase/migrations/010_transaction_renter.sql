-- Preserve renter ownership for manually typed tracking records.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS renter_id integer REFERENCES public.users(user_id) ON DELETE SET NULL;