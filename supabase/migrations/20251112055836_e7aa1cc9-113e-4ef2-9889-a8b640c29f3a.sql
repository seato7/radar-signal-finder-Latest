-- Fix RLS policies to allow edge functions to insert API logs
-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Admin can view API usage logs" ON api_usage_logs;
DROP POLICY IF EXISTS "Admin can view API costs" ON api_costs;
DROP POLICY IF EXISTS "Admin can view Yahoo health" ON yahoo_finance_health;

-- Allow service role (edge functions) to insert API usage logs
CREATE POLICY "Service role can insert API logs"
ON api_usage_logs
FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow service role to update Yahoo health
CREATE POLICY "Service role can manage Yahoo health"
ON yahoo_finance_health
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Re-create admin SELECT policies
CREATE POLICY "Admin can view API usage logs"
ON api_usage_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admin can view API costs"
ON api_costs
FOR SELECT  
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admin can view Yahoo health"
ON yahoo_finance_health
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);