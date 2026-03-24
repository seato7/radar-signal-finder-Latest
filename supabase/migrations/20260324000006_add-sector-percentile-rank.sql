ALTER TABLE assets ADD COLUMN IF NOT EXISTS sector_percentile_rank NUMERIC;

CREATE INDEX IF NOT EXISTS idx_assets_sector_percentile ON assets(asset_class, sector_percentile_rank);
