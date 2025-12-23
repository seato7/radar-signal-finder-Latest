-- Create a function to update the last_updated_at timestamp on price updates
CREATE OR REPLACE FUNCTION update_prices_last_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a trigger that fires BEFORE UPDATE on prices
CREATE TRIGGER trigger_update_prices_last_updated_at
  BEFORE UPDATE ON prices
  FOR EACH ROW
  EXECUTE FUNCTION update_prices_last_updated_at();