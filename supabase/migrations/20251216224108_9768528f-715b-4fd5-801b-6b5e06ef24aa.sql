-- Add 6 new broad-market themes to capture the majority of ETF signals
INSERT INTO public.themes (name, keywords, alpha) VALUES
  ('Fixed Income & Bonds', ARRAY['bond', 'treasury', 'municipal', 'corporate', 'yield', 'debt', 'income', 'fixed'], 1.0),
  ('Growth & Allocation', ARRAY['allocation', 'balanced', 'moderate', 'aggressive', 'conservative', 'growth', 'value'], 1.0),
  ('International & Emerging', ARRAY['international', 'emerging', 'global', 'foreign', 'msci', 'europe', 'asia', 'china', 'japan'], 1.0),
  ('Index & Passive', ARRAY['index', 'sp500', 'total', 'market', 'core', 'passive', 'tracker', 'benchmark'], 1.0),
  ('Income & Dividend', ARRAY['dividend', 'income', 'yield', 'distribution', 'equity income', 'high yield'], 1.0),
  ('Retirement & Target Date', ARRAY['retirement', 'target', 'lifetime', 'freedom', '2025', '2030', '2035', '2040', '2045', '2050', '2055', '2060', '2065'], 1.0)
ON CONFLICT (name) DO NOTHING;