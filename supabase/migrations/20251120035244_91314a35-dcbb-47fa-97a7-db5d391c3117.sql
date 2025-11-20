-- =====================================================
-- COMPREHENSIVE FIX FOR 100/100 PRODUCTION READINESS
-- =====================================================

-- 1. Create theme_scores table to store computed scores
CREATE TABLE IF NOT EXISTS public.theme_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  component_scores JSONB DEFAULT '{}'::jsonb,
  positive_components TEXT[] DEFAULT ARRAY[]::TEXT[],
  signal_count INTEGER DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast theme score lookups
CREATE INDEX IF NOT EXISTS idx_theme_scores_theme_id ON public.theme_scores(theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_scores_score ON public.theme_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_theme_scores_computed_at ON public.theme_scores(computed_at DESC);

-- 2. Create user_theme_subscriptions for alert subscriptions
CREATE TABLE IF NOT EXISTS public.user_theme_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, theme_id)
);

-- Index for fast subscription lookups
CREATE INDEX IF NOT EXISTS idx_user_theme_subs_user ON public.user_theme_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_theme_subs_theme ON public.user_theme_subscriptions(theme_id);

-- 3. Enable RLS on new tables
ALTER TABLE public.theme_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_theme_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for theme_scores (read-only for all authenticated users)
CREATE POLICY "Anyone can view theme scores"
  ON public.theme_scores FOR SELECT
  TO authenticated
  USING (true);

-- RLS policies for user_theme_subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON public.user_theme_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subscriptions"
  ON public.user_theme_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON public.user_theme_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Add score column to themes for quick access (denormalized)
ALTER TABLE public.themes 
ADD COLUMN IF NOT EXISTS score NUMERIC DEFAULT 0 CHECK (score >= 0 AND score <= 100);

-- 5. Add tickers array to themes for filtering
ALTER TABLE public.themes 
ADD COLUMN IF NOT EXISTS tickers TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 6. Update existing themes with broader, more inclusive keywords
UPDATE public.themes 
SET keywords = ARRAY[
  'tech', 'technology', 'software', 'hardware', 'innovation',
  'FAANG', 'large-cap', 'growth', 'AI', 'artificial intelligence',
  'cloud', 'data', 'digital', 'platform', 'internet',
  'buying', 'bullish', 'upgrade', 'outperform', 'strong buy',
  'insider buy', 'institutional', 'smart money', 'accumulation'
]
WHERE name = 'Big Tech Bullish Outlook';

UPDATE public.themes
SET keywords = ARRAY[
  'AI', 'artificial intelligence', 'machine learning', 'deep learning',
  'semiconductor', 'chip', 'GPU', 'processor', 'silicon',
  'NVDA', 'AMD', 'INTC', 'neural', 'compute', 'datacenter',
  'training', 'inference', 'LLM', 'model', 'algorithm'
]
WHERE name = 'AI Chip Dominance';

UPDATE public.themes
SET keywords = ARRAY[
  'EV', 'electric vehicle', 'battery', 'charging', 'Tesla',
  'green', 'clean energy', 'renewable', 'solar', 'wind',
  'sustainable', 'carbon', 'emission', 'climate', 'ESG',
  'lithium', 'energy storage', 'grid', 'infrastructure'
]
WHERE name = 'EV & Green Energy Push';

UPDATE public.themes
SET keywords = ARRAY[
  'meme', 'retail', 'WSB', 'short squeeze', 'gamma',
  'Reddit', 'social', 'viral', 'trending', 'momentum',
  'volatility', 'speculation', 'short interest', 'squeeze',
  'options', 'volume surge', 'breakout'
]
WHERE name = 'Meme Stock Volatility Watch';

-- 7. Create function to get latest theme score
CREATE OR REPLACE FUNCTION public.get_latest_theme_score(p_theme_id UUID)
RETURNS TABLE (
  score NUMERIC,
  component_scores JSONB,
  positive_components TEXT[],
  signal_count INTEGER,
  computed_at TIMESTAMPTZ
) 
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ts.score,
    ts.component_scores,
    ts.positive_components,
    ts.signal_count,
    ts.computed_at
  FROM theme_scores ts
  WHERE ts.theme_id = p_theme_id
  ORDER BY ts.computed_at DESC
  LIMIT 1;
$$;

-- 8. Create function to check if user is subscribed to theme
CREATE OR REPLACE FUNCTION public.is_subscribed_to_theme(p_user_id UUID, p_theme_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_theme_subscriptions
    WHERE user_id = p_user_id AND theme_id = p_theme_id
  );
$$;

-- 9. Create view for theme overview with latest scores
CREATE OR REPLACE VIEW public.theme_overview AS
SELECT 
  t.id,
  t.name,
  t.keywords,
  t.tickers,
  t.score as cached_score,
  ts.score as latest_score,
  ts.component_scores,
  ts.positive_components,
  ts.signal_count,
  ts.computed_at as score_updated_at,
  (SELECT COUNT(*) FROM signal_theme_map WHERE theme_id = t.id) as total_mapped_signals,
  (SELECT COUNT(*) FROM user_theme_subscriptions WHERE theme_id = t.id) as subscriber_count
FROM themes t
LEFT JOIN LATERAL (
  SELECT * FROM theme_scores
  WHERE theme_id = t.id
  ORDER BY computed_at DESC
  LIMIT 1
) ts ON true
ORDER BY ts.score DESC NULLS LAST;

-- 10. Update themes with initial score from their latest computation
UPDATE public.themes t
SET score = COALESCE((
  SELECT ts.score 
  FROM theme_scores ts 
  WHERE ts.theme_id = t.id 
  ORDER BY ts.computed_at DESC 
  LIMIT 1
), 0);

-- 11. Create trigger to update themes.score when new theme_scores inserted
CREATE OR REPLACE FUNCTION public.update_theme_score_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE themes
  SET score = NEW.score,
      updated_at = NOW()
  WHERE id = NEW.theme_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_theme_score_cache
  AFTER INSERT ON public.theme_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_theme_score_cache();