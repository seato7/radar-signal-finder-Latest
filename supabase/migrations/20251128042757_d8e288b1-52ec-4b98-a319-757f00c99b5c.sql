-- Fix 1: Enable RLS on function_status table
ALTER TABLE public.function_status ENABLE ROW LEVEL SECURITY;

-- Add policy for public read access (intentional for monitoring)
CREATE POLICY "Public read access for monitoring"
  ON public.function_status
  FOR SELECT
  USING (true);

-- Service role can write
CREATE POLICY "Service role can insert function status"
  ON public.function_status
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- Fix 2: Add SET search_path to update_circuit_breaker_updated_at function
DROP FUNCTION IF EXISTS public.update_circuit_breaker_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.update_circuit_breaker_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recreate trigger if it was dropped
DROP TRIGGER IF EXISTS update_circuit_breaker_updated_at_trigger ON public.circuit_breaker_status;
CREATE TRIGGER update_circuit_breaker_updated_at_trigger
  BEFORE UPDATE ON public.circuit_breaker_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_circuit_breaker_updated_at();