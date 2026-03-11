-- Enable idempotent upserts on asset_predictions.
-- daily-prediction-snapshot upserts on (snapshot_date, asset_id) so a crashed
-- mid-run can be safely re-run without creating duplicate snapshot rows.

-- Remove any existing duplicates first, keeping the latest row per pair.
DELETE FROM asset_predictions a
WHERE a.id != (
  SELECT id FROM asset_predictions b
  WHERE b.snapshot_date = a.snapshot_date
    AND b.asset_id = a.asset_id
  ORDER BY b.computed_at DESC
  LIMIT 1
);

ALTER TABLE asset_predictions
  ADD CONSTRAINT asset_predictions_snapshot_date_asset_id_unique
  UNIQUE (snapshot_date, asset_id);
