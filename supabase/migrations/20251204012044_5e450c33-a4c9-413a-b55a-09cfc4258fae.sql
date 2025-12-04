-- Enable RLS on the rate limits table
ALTER TABLE public.twelvedata_rate_limits ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage rate limits"
ON public.twelvedata_rate_limits FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Allow public read for monitoring
CREATE POLICY "Public can read rate limit status"
ON public.twelvedata_rate_limits FOR SELECT
USING (true);

-- Fix search_path for the new functions
ALTER FUNCTION public.acquire_twelvedata_credits(INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION public.get_twelvedata_credits_status() SET search_path = public;