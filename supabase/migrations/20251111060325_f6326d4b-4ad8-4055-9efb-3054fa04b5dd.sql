-- Drop and recreate view_test_suite_summary
DROP VIEW IF EXISTS view_test_suite_summary;

CREATE VIEW view_test_suite_summary AS
SELECT
  test_suite,
  COUNT(*) FILTER (WHERE status = 'PASS') as passed,
  COUNT(*) FILTER (WHERE status = 'FAIL') as failed,
  COUNT(*) FILTER (WHERE status = 'WARN') as warnings,
  COUNT(*) as total,
  MAX(tested_at) as last_run
FROM ingest_logs_test_audit
GROUP BY test_suite;