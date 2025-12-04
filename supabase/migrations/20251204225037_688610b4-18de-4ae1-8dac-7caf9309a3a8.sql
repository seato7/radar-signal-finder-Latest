-- Drop and recreate the function without FOR UPDATE (causes read-only transaction errors)
DROP FUNCTION IF EXISTS public.acquire_twelvedata_credits(integer, integer);

CREATE OR REPLACE FUNCTION public.acquire_twelvedata_credits(credits_needed integer, max_credits integer DEFAULT 50)
 RETURNS TABLE(acquired boolean, current_credits integer, wait_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_minute TEXT;
  stored_minute TEXT;
  stored_credits INTEGER;
  new_credits INTEGER;
  seconds_until_next_minute INTEGER;
BEGIN
  -- Get current minute key
  current_minute := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH24-MI');
  
  -- Calculate seconds until next minute (add 2s buffer = 62s total cycle)
  seconds_until_next_minute := 62 - EXTRACT(SECOND FROM now())::INTEGER;
  IF seconds_until_next_minute < 2 THEN
    seconds_until_next_minute := 62;
  END IF;
  
  -- Get current values
  SELECT t.minute_key, t.credits_used INTO stored_minute, stored_credits
  FROM public.twelvedata_rate_limits t
  WHERE t.id = 'global';
  
  -- Handle case where row doesn't exist
  IF stored_minute IS NULL THEN
    INSERT INTO public.twelvedata_rate_limits (id, minute_key, credits_used, last_updated_at)
    VALUES ('global', current_minute, credits_needed, now())
    ON CONFLICT (id) DO UPDATE SET minute_key = current_minute, credits_used = credits_needed, last_updated_at = now();
    
    RETURN QUERY SELECT true, credits_needed, 0;
    RETURN;
  END IF;
  
  -- Reset if new minute
  IF stored_minute != current_minute THEN
    UPDATE public.twelvedata_rate_limits
    SET minute_key = current_minute, credits_used = credits_needed, last_updated_at = now()
    WHERE id = 'global';
    
    RETURN QUERY SELECT true, credits_needed, 0;
    RETURN;
  END IF;
  
  -- Check if we can acquire within same minute
  IF COALESCE(stored_credits, 0) + credits_needed <= max_credits THEN
    new_credits := COALESCE(stored_credits, 0) + credits_needed;
    
    UPDATE public.twelvedata_rate_limits
    SET credits_used = new_credits, last_updated_at = now()
    WHERE id = 'global';
    
    RETURN QUERY SELECT true, new_credits, 0;
    RETURN;
  END IF;
  
  -- Cannot acquire - return wait time
  RETURN QUERY SELECT false, COALESCE(stored_credits, 0), seconds_until_next_minute;
END;
$function$;