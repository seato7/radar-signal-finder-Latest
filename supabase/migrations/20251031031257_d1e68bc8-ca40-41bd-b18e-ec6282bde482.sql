-- ============================================
-- MIGRATION: Full MongoDB to Supabase
-- ============================================

-- Create custom types
CREATE TYPE signal_direction AS ENUM ('up', 'down', 'neutral');
CREATE TYPE alert_status AS ENUM ('active', 'dismissed');

-- ============================================
-- SIGNALS TABLE
-- ============================================
CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type TEXT NOT NULL,
  asset_id UUID,
  theme_id UUID,
  value_text TEXT,
  direction signal_direction,
  magnitude FLOAT DEFAULT 1.0,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  raw JSONB DEFAULT '{}'::jsonb,
  citation JSONB NOT NULL,
  source_id TEXT,
  checksum TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_signals_theme_id ON public.signals(theme_id);
CREATE INDEX idx_signals_observed_at ON public.signals(observed_at DESC);
CREATE INDEX idx_signals_type ON public.signals(signal_type);
CREATE INDEX idx_signals_checksum ON public.signals(checksum);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signals are readable by everyone"
  ON public.signals FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert signals"
  ON public.signals FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Service role can update signals"
  ON public.signals FOR UPDATE
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- ============================================
-- THEMES TABLE
-- ============================================
CREATE TABLE public.themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  alpha FLOAT DEFAULT 1.0,
  contributors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_themes_name ON public.themes(name);

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Themes are readable by everyone"
  ON public.themes FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage themes"
  ON public.themes FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- ============================================
-- ALERTS TABLE
-- ============================================
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  theme_name TEXT NOT NULL,
  score FLOAT NOT NULL,
  positives TEXT[] DEFAULT '{}',
  dont_miss JSONB,
  status alert_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_id ON public.alerts(user_id);
CREATE INDEX idx_alerts_theme_id ON public.alerts(theme_id);
CREATE INDEX idx_alerts_status ON public.alerts(status);
CREATE INDEX idx_alerts_created_at ON public.alerts(created_at DESC);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own alerts"
  ON public.alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert alerts"
  ON public.alerts FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Users can update their own alerts"
  ON public.alerts FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- ASSETS TABLE
-- ============================================
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  exchange TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_assets_ticker_exchange ON public.assets(ticker, exchange);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assets are readable by everyone"
  ON public.assets FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage assets"
  ON public.assets FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- ============================================
-- PRICES TABLE
-- ============================================
CREATE TABLE public.prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  date DATE NOT NULL,
  close FLOAT NOT NULL,
  checksum TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prices_ticker ON public.prices(ticker);
CREATE INDEX idx_prices_date ON public.prices(date DESC);
CREATE INDEX idx_prices_checksum ON public.prices(checksum);
CREATE UNIQUE INDEX idx_prices_ticker_date ON public.prices(ticker, date);

ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prices are readable by everyone"
  ON public.prices FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage prices"
  ON public.prices FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- ============================================
-- WATCHLIST TABLE
-- ============================================
CREATE TABLE public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tickers TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_watchlist_user_id ON public.watchlist(user_id);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own watchlist"
  ON public.watchlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watchlist"
  ON public.watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlist"
  ON public.watchlist FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlist"
  ON public.watchlist FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- SOURCES TABLE
-- ============================================
CREATE TABLE public.sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  last_fetched TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sources are readable by everyone"
  ON public.sources FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage sources"
  ON public.sources FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- ============================================
-- SEED CANONICAL THEMES
-- ============================================
INSERT INTO public.themes (name, keywords, alpha, metadata) VALUES
  ('AI Liquid Cooling', ARRAY['liquid cooling', 'data center', 'datacenter', 'thermal'], 1.0, '{"auto_discovered": false}'::jsonb),
  ('Water Reuse', ARRAY['desal', 'reverse osmosis', 'water reuse', 'pipeline'], 1.0, '{"auto_discovered": false}'::jsonb),
  ('HVDC Transformers', ARRAY['hvdc', 'transformer', 'transmission', 'interconnector', 'grid'], 1.0, '{"auto_discovered": false}'::jsonb)
ON CONFLICT (name) DO NOTHING;