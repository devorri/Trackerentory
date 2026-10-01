-- Add recoverable soft deletion for staff accounts.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;