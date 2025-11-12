-- Add encryption version tracking to broker_keys
ALTER TABLE broker_keys 
ADD COLUMN IF NOT EXISTS encryption_version text DEFAULT 'v1';

-- Create audit log table for key rotations
CREATE TABLE IF NOT EXISTS broker_key_rotation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_key_id uuid NOT NULL REFERENCES broker_keys(id) ON DELETE CASCADE,
  old_encryption_version text NOT NULL,
  new_encryption_version text NOT NULL,
  rotated_at timestamp with time zone DEFAULT now(),
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS on rotation logs
ALTER TABLE broker_key_rotation_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own rotation logs
CREATE POLICY "Users can view their own rotation logs"
ON broker_key_rotation_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert rotation logs
CREATE POLICY "Service role can insert rotation logs"
ON broker_key_rotation_logs
FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_broker_keys_encryption_version 
ON broker_keys(user_id, encryption_version);

CREATE INDEX IF NOT EXISTS idx_rotation_logs_user 
ON broker_key_rotation_logs(user_id, rotated_at DESC);

-- Mark all existing keys as v1 (legacy) if they haven't been set yet
UPDATE broker_keys 
SET encryption_version = 'v1' 
WHERE encryption_version IS NULL;