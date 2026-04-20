-- EMERGENCY cleanup: purge the 22 bad trade_signals generated during the
-- cap-broken + Tavily-exit window. The exact set isn't enumerated, so this uses
-- a recency filter. Supabase migrations apply once so re-application isn't a
-- concern — NOW() resolves at deploy time, minutes after the fix commit.
--
-- Context:
--   1. The 5-signal cap was broken (22 signals opened in one run)
--   2. Tavily price verification in check-trade-exits extracted wrong prices
--      from unrelated article context, producing catastrophic false exits:
--        - ARYD exit $1.55 vs $10.54 entry (-85%)
--        - AGEN exit $4.54 vs $29.86 entry (-85%)
--   3. Both paths are fixed in this same deploy; this purges the residue.

DELETE FROM trade_signals
WHERE created_at >= NOW() - INTERVAL '3 hours';
