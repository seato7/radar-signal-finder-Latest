-- Fix technical pipeline tables for idempotent upserts
--
-- Context: ingest-advanced-technicals and ingest-pattern-recognition have been dead
-- since Dec 4 due to: (1) no unique constraint preventing upsert, (2) stale/fake data
-- accumulation from unbounded inserts. This migration truncates the stale data and
-- adds unique constraints so the functions can use upsert going forward.
--
-- advanced_technicals: stores one current-state row per ticker (VWAP, stochastic, fib levels, etc.)
-- pattern_recognition: stores one row per (ticker, pattern_type, timeframe) combo

-- Step 1: Truncate stale data.
-- advanced_technicals contains either synthetic random data (from the now-removed
-- generateEstimatedTechnicals fallback) or real data that is 3+ months stale.
-- pattern_recognition patterns from Dec 4 are months stale and no longer actionable.
-- Start fresh so the functions can repopulate with current real data.
TRUNCATE TABLE advanced_technicals;
TRUNCATE TABLE pattern_recognition;

-- Step 2: Add unique constraints to enable idempotent upserts.
-- advanced_technicals: one current-state row per ticker
ALTER TABLE advanced_technicals
  ADD CONSTRAINT advanced_technicals_ticker_unique UNIQUE (ticker);

-- pattern_recognition: one row per (ticker, pattern_type, timeframe) combo
-- timeframe is always 'daily' in current detection logic
ALTER TABLE pattern_recognition
  ADD CONSTRAINT pattern_recognition_ticker_type_tf_unique UNIQUE (ticker, pattern_type, timeframe);
