-- Drop the existing view with SECURITY DEFINER
DROP VIEW IF EXISTS public.asset_signal_summary;

-- Recreate the view without SECURITY DEFINER to respect RLS policies
CREATE VIEW public.asset_signal_summary AS
SELECT 
  a.id as asset_id,
  a.ticker,
  a.name,
  a.asset_class,
  a.exchange,
  COUNT(DISTINCT CASE WHEN s.signal_category = 'insider' THEN s.id END) as insider_signals,
  COUNT(DISTINCT CASE WHEN s.signal_category = 'institutional' THEN s.id END) as institutional_signals,
  COUNT(DISTINCT CASE WHEN s.signal_category = 'technical' THEN s.id END) as technical_signals,
  COUNT(DISTINCT CASE WHEN s.signal_category = 'sentiment' THEN s.id END) as sentiment_signals,
  COUNT(DISTINCT CASE WHEN s.signal_category = 'flow' THEN s.id END) as flow_signals,
  COUNT(DISTINCT pr.id) as active_patterns,
  ns.sentiment_label as news_sentiment,
  MAX(s.observed_at) as last_signal_at,
  at.current_price,
  at.trend_strength as trend,
  smf.institutional_net_flow as smart_money_flow
FROM public.assets a
LEFT JOIN public.signals s ON a.id = s.asset_id AND s.observed_at > NOW() - INTERVAL '7 days'
LEFT JOIN public.pattern_recognition pr ON a.id = pr.asset_id AND pr.status = 'confirmed'
LEFT JOIN public.news_sentiment_aggregate ns ON a.ticker = ns.ticker AND ns.date = CURRENT_DATE
LEFT JOIN public.advanced_technicals at ON a.ticker = at.ticker
LEFT JOIN public.smart_money_flow smf ON a.ticker = smf.ticker
GROUP BY 
  a.id, 
  a.ticker, 
  a.name, 
  a.asset_class, 
  a.exchange,
  ns.sentiment_label,
  at.current_price,
  at.trend_strength,
  smf.institutional_net_flow;

-- Grant access to authenticated and anonymous users
GRANT SELECT ON public.asset_signal_summary TO authenticated;
GRANT SELECT ON public.asset_signal_summary TO anon;