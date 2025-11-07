
-- Fix the critical RLS vulnerability in alerts table
-- Step 1: Delete any alerts with NULL user_id (orphaned alerts)
DELETE FROM alerts WHERE user_id IS NULL;

-- Step 2: Add NOT NULL constraint to prevent future NULL insertions
ALTER TABLE alerts 
ALTER COLUMN user_id SET NOT NULL;

-- Add comment explaining the security requirement
COMMENT ON COLUMN alerts.user_id IS 'Required for RLS policies - must never be NULL to prevent access control bypass';
