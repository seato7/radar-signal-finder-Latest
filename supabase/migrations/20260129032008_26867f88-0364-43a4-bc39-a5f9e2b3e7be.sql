-- Create the execute_sql RPC for scoring calibration operations
-- This is restricted to service_role only for security
CREATE OR REPLACE FUNCTION public.execute_sql(sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only allow service_role
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: service_role required';
  END IF;
  
  EXECUTE sql INTO result;
  RETURN result;
END;
$$;

-- Also create a helper RPC to get the global mean for scoring
CREATE OR REPLACE FUNCTION public.get_scoring_global_mean()
RETURNS TABLE(global_mean numeric, cnt bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT AVG(expected_return) as global_mean, COUNT(*) as cnt 
  FROM assets 
  WHERE expected_return IS NOT NULL 
    AND rank_status = 'rankable';
$$;

-- Create a helper RPC to apply the global recentering correction
CREATE OR REPLACE FUNCTION public.apply_scoring_recenter(correction numeric)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows bigint;
BEGIN
  -- Only allow service_role
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: service_role required';
  END IF;
  
  UPDATE assets 
  SET expected_return = expected_return - correction,
      score_computed_at = NOW()
  WHERE expected_return IS NOT NULL 
    AND rank_status = 'rankable';
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;