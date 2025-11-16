-- Add updated_at column to prices table for freshness tracking
ALTER TABLE prices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for efficient freshness queries
CREATE INDEX IF NOT EXISTS idx_prices_updated_at ON prices(updated_at);

-- Backfill existing records (use created_at or now if created_at doesn't exist)
UPDATE prices 
SET updated_at = COALESCE(created_at, NOW()) 
WHERE updated_at IS NULL;

-- Add trigger to auto-update updated_at on row modifications
CREATE OR REPLACE FUNCTION update_prices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_prices_updated_at ON prices;
CREATE TRIGGER trigger_update_prices_updated_at
  BEFORE UPDATE ON prices
  FOR EACH ROW
  EXECUTE FUNCTION update_prices_updated_at();