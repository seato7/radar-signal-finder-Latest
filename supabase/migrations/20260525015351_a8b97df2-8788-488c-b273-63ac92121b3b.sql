
-- =============================================================
-- PHASE 6C: Security Hardening Cleanup
-- =============================================================

-- ---------- PART 1: Function search_path ----------
ALTER FUNCTION public._plan_watchlist_slot_limit(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_price_changes(date)        SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()               SET search_path = public, pg_temp;

-- ---------- PART 2: Revoke dead write grants ----------
REVOKE INSERT, UPDATE, DELETE ON public.prices                       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scoring_validation_results   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.price_ingestion_log          FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.function_status              FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ingest_failures              FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ingest_logs_test_audit       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.theme_analyses               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ingest_logs                  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.api_usage_logs               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.log_error_events             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.twelvedata_rate_limits       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scoring_config               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_scores                    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.backtest_analyses            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.company_fundamentals         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.eps_revisions                FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.breaking_news                FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.congressional_trades         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.earnings_sentiment           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.job_postings                 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.options_flow                 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.patent_filings               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.search_trends                FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.short_interest               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_signals               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supply_chain_signals         FROM anon, authenticated;

-- ---------- PART 3: Views → security_invoker ----------
ALTER VIEW public.asset_signal_summary         SET (security_invoker = on);
ALTER VIEW public.assets_ticker_commas         SET (security_invoker = on);
ALTER VIEW public.interest_rate_differentials  SET (security_invoker = on);
ALTER VIEW public.source_usage_stats           SET (security_invoker = on);
ALTER VIEW public.theme_overview               SET (security_invoker = on);
ALTER VIEW public.view_api_errors              SET (security_invoker = on);
ALTER VIEW public.view_duplicate_key_errors    SET (security_invoker = on);
ALTER VIEW public.view_fallback_usage          SET (security_invoker = on);
ALTER VIEW public.view_function_freshness      SET (security_invoker = on);
ALTER VIEW public.view_stale_tickers           SET (security_invoker = on);
ALTER VIEW public.view_test_suite_summary      SET (security_invoker = on);

-- ---------- PART 4: Replace permissive public-role INSERT policies ----------
DROP POLICY IF EXISTS "Allow service role to insert breaking news"            ON public.breaking_news;
CREATE POLICY "Service role can insert breaking news"        ON public.breaking_news        FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert congressional trades"     ON public.congressional_trades;
CREATE POLICY "Service role can insert congressional trades" ON public.congressional_trades FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert earnings sentiment"       ON public.earnings_sentiment;
CREATE POLICY "Service role can insert earnings sentiment"   ON public.earnings_sentiment   FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert job postings"             ON public.job_postings;
CREATE POLICY "Service role can insert job postings"         ON public.job_postings         FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert options flow"             ON public.options_flow;
CREATE POLICY "Service role can insert options flow"         ON public.options_flow         FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert patent filings"           ON public.patent_filings;
CREATE POLICY "Service role can insert patent filings"       ON public.patent_filings       FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert search trends"            ON public.search_trends;
CREATE POLICY "Service role can insert search trends"        ON public.search_trends        FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert short interest"           ON public.short_interest;
CREATE POLICY "Service role can insert short interest"       ON public.short_interest       FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert social signals"           ON public.social_signals;
CREATE POLICY "Service role can insert social signals"       ON public.social_signals       FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to insert supply chain signals"     ON public.supply_chain_signals;
CREATE POLICY "Service role can insert supply chain signals" ON public.supply_chain_signals FOR INSERT TO service_role WITH CHECK (true);

-- ---------- PART 5: Revoke EXECUTE on internal/admin SECURITY DEFINER helpers ----------
-- Service-role-internal admin functions
REVOKE EXECUTE ON FUNCTION public.execute_sql(text)                                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_scoring_recenter(numeric)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ai_fallback_usage()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_excessive_fallback_usage()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_function_staleness(text, integer)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_signal_distribution_skew()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_and_update_coverage(date, text, integer)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_assets_from_coverage(date, text)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_price_aggregates(date, integer)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acquire_twelvedata_credits(integer, integer)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_twelvedata_credits_status()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_api_usage_summary(integer)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_scoring_global_mean()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_stale_functions()                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_stale_tickers(text)                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, integer)                       FROM PUBLIC, anon;
-- Trigger functions (never need to be invoked directly)
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role()                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_prices_updated_at()                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_prices_last_updated_at()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_circuit_breaker_updated_at()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_theme_score_cache()                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._enforce_alerts_plan_limit()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._enforce_watchlist_plan_limit()                         FROM PUBLIC, anon, authenticated;
