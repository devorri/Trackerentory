-- Add auth_id to users table to map Supabase auth users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
