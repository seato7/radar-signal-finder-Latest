
-- Add UPDATE permission for service role on ingest_logs
DROP POLICY IF EXISTS "Service role write access" ON ingest_logs;

CREATE POLICY "Service role full write access"
  ON ingest_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
