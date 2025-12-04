-- Create shared rate limit tracking table for Twelve Data
CREATE TABLE IF NOT EXISTS public.twelvedata_rate_limits (
  id TEXT PRIMARY KEY DEFAULT 'global',
  minute_key TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert the single global row
INSERT INTO public.twelvedata_rate_limits (id, minute_key, credits_used)
VALUES ('global', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH24-MI'), 0)
ON CONFLICT (id) DO NOTHING;

-- Create function to acquire credits atomically
CREATE OR REPLACE FUNCTION public.acquire_twelvedata_credits(
  credits_needed INTEGER,
  max_credits INTEGER DEFAULT 50
)
RETURNS TABLE(
  acquired BOOLEAN,
  current_credits INTEGER,
  wait_seconds INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  current_minute TEXT;
  stored_minute TEXT;
  stored_credits INTEGER;
  seconds_until_next_minute INTEGER;
BEGIN
  -- Get current minute key
  current_minute := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH24-MI');
  
  -- Calculate seconds until next minute
  seconds_until_next_minute := 60 - EXTRACT(SECOND FROM now())::INTEGER + 2;
  
  -- Lock and check/update atomically
  SELECT minute_key, credits_used INTO stored_minute, stored_credits
  FROM public.twelvedata_rate_limits
  WHERE id = 'global'
  FOR UPDATE;
  
  -- Reset if new minute
  IF stored_minute != current_minute THEN
    UPDATE public.twelvedata_rate_limits
    SET minute_key = current_minute, credits_used = credits_needed, last_updated_at = now()
    WHERE id = 'global';
    
    RETURN QUERY SELECT true, credits_needed, 0;
    RETURN;
  END IF;
  
  -- Check if we can acquire
  IF stored_credits + credits_needed <= max_credits THEN
    UPDATE public.twelvedata_rate_limits
    SET credits_used = stored_credits + credits_needed, last_updated_at = now()
    WHERE id = 'global';
    
    RETURN QUERY SELECT true, stored_credits + credits_needed, 0;
    RETURN;
  END IF;
  
  -- Cannot acquire - return wait time
  RETURN QUERY SELECT false, stored_credits, seconds_until_next_minute;
END;
$$;

-- Create function to check current status
CREATE OR REPLACE FUNCTION public.get_twelvedata_credits_status()
RETURNS TABLE(
  minute_key TEXT,
  credits_used INTEGER,
  credits_remaining INTEGER,
  seconds_until_reset INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  current_minute TEXT;
  stored_minute TEXT;
  stored_credits INTEGER;
BEGIN
  current_minute := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH24-MI');
  
  SELECT t.minute_key, t.credits_used INTO stored_minute, stored_credits
  FROM public.twelvedata_rate_limits t
  WHERE id = 'global';
  
  -- If different minute, credits are effectively 0
  IF stored_minute != current_minute THEN
    stored_credits := 0;
  END IF;
  
  RETURN QUERY SELECT 
    current_minute,
    stored_credits,
    50 - stored_credits,
    60 - EXTRACT(SECOND FROM now())::INTEGER + 2;
END;
$$;