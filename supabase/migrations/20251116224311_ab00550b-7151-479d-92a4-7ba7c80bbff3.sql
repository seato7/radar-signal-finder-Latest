-- Fix search_path for update_prices_updated_at function (security linter warning)
CREATE OR REPLACE FUNCTION update_prices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public;