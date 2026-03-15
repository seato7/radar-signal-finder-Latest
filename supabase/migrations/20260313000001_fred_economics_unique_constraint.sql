-- Add series_id column to economic_indicators and enforce uniqueness on
-- (series_id, release_date) so ingest-fred-economics upserts are idempotent.
--
-- series_id is the FRED series identifier (e.g. 'GDP', 'FEDFUNDS', 'DFF').
-- indicator_type alone is not unique per series — FEDFUNDS and DFF both map to
-- 'interest_rate', so (indicator_type, country, release_date) would collide.

-- 1. Add the column (nullable so existing rows are unaffected)
ALTER TABLE economic_indicators
  ADD COLUMN IF NOT EXISTS series_id TEXT;

-- 2. Backfill from metadata for rows written by the old function
UPDATE economic_indicators
SET series_id = metadata->>'series_id'
WHERE series_id IS NULL
  AND metadata->>'series_id' IS NOT NULL;

-- 3. Remove duplicates before adding the constraint, keeping the newest row per
--    (series_id, release_date) pair. Only affects rows where series_id is known.
DELETE FROM economic_indicators a
WHERE series_id IS NOT NULL
  AND a.id != (
    SELECT id FROM economic_indicators b
    WHERE b.series_id = a.series_id
      AND b.release_date = a.release_date
    ORDER BY b.created_at DESC
    LIMIT 1
  );

-- 4. Add the unique constraint
ALTER TABLE economic_indicators
  ADD CONSTRAINT economic_indicators_series_id_release_date_key
  UNIQUE (series_id, release_date);
