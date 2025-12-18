-- Migration: Add supabase_user_id column to users table
-- Run this in Supabase SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS supabase_user_id UUID;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id ON users(supabase_user_id);

-- Add comment
COMMENT ON COLUMN users.supabase_user_id IS 'Reference to Supabase Auth user ID';


