-- API Usage Tracking Tables
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name TEXT NOT NULL,
  endpoint TEXT,
  function_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success', 'failure', 'cached'
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_logs_api_name ON public.api_usage_logs(api_name);
CREATE INDEX idx_api_usage_logs_created_at ON public.api_usage_logs(created_at);
CREATE INDEX idx_api_usage_logs_function_name ON public.api_usage_logs(function_name);

-- API Cost Configuration
CREATE TABLE IF NOT EXISTS public.api_costs (
  api_name TEXT PRIMARY KEY,
  cost_per_call NUMERIC(10, 6) DEFAULT 0,
  is_paid BOOLEAN DEFAULT FALSE,
  daily_limit INTEGER,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert known API costs
INSERT INTO public.api_costs (api_name, cost_per_call, is_paid, daily_limit, notes) VALUES
  ('Perplexity', 0.001, TRUE, 200, 'Sonar model - $0.001 per call'),
  ('Yahoo Finance', 0, FALSE, NULL, 'Free API'),
  ('Gemini', 0.001, TRUE, 400, 'Lovable AI Gateway fallback'),
  ('Alpha Vantage', 0, FALSE, 500, 'Free tier: 500 calls/day'),
  ('FRED', 0, FALSE, NULL, 'Free API'),
  ('Reddit', 0, FALSE, NULL, 'Free API'),
  ('StockTwits', 0, FALSE, NULL, 'Free API'),
  ('Adzuna', 0, FALSE, NULL, 'Free API with key'),
  ('SEC EDGAR', 0, FALSE, NULL, 'Free API')
ON CONFLICT (api_name) DO NOTHING;

-- Yahoo Finance Reliability Tracking
CREATE TABLE IF NOT EXISTS public.yahoo_finance_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_calls INTEGER NOT NULL DEFAULT 0,
  successful_calls INTEGER NOT NULL DEFAULT 0,
  failed_calls INTEGER NOT NULL DEFAULT 0,
  reliability_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_yahoo_health_created_at ON public.yahoo_finance_health(created_at);

-- Function to calculate API usage summary
CREATE OR REPLACE FUNCTION get_api_usage_summary(hours_back INTEGER DEFAULT 24)
RETURNS TABLE(
  api_name TEXT,
  total_calls BIGINT,
  successful_calls BIGINT,
  failed_calls BIGINT,
  cached_calls BIGINT,
  success_rate NUMERIC,
  avg_response_time_ms NUMERIC,
  estimated_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    aul.api_name,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE aul.status = 'success') as successful_calls,
    COUNT(*) FILTER (WHERE aul.status = 'failure') as failed_calls,
    COUNT(*) FILTER (WHERE aul.status = 'cached') as cached_calls,
    ROUND((COUNT(*) FILTER (WHERE aul.status = 'success')::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as success_rate,
    ROUND(AVG(aul.response_time_ms)::NUMERIC, 2) as avg_response_time_ms,
    ROUND((COUNT(*) FILTER (WHERE aul.status = 'success')::NUMERIC * COALESCE(ac.cost_per_call, 0)), 4) as estimated_cost
  FROM public.api_usage_logs aul
  LEFT JOIN public.api_costs ac ON aul.api_name = ac.api_name
  WHERE aul.created_at > NOW() - INTERVAL '1 hour' * hours_back
  GROUP BY aul.api_name, ac.cost_per_call
  ORDER BY total_calls DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to check Yahoo Finance reliability
CREATE OR REPLACE FUNCTION check_yahoo_reliability()
RETURNS TABLE(
  reliability_pct NUMERIC,
  total_calls BIGINT,
  successful_calls BIGINT,
  failed_calls BIGINT,
  should_enable_fallback BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROUND((COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as reliability_pct,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'success') as successful_calls,
    COUNT(*) FILTER (WHERE status = 'failure') as failed_calls,
    (COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0)) < 0.95 as should_enable_fallback
  FROM public.api_usage_logs
  WHERE api_name = 'Yahoo Finance' 
    AND created_at > NOW() - INTERVAL '24 hours'
    AND function_name = 'ingest-prices-yahoo';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yahoo_finance_health ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin and system access)
CREATE POLICY "Admin can view API usage logs" ON public.api_usage_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can view API costs" ON public.api_costs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can view Yahoo health" ON public.yahoo_finance_health
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );