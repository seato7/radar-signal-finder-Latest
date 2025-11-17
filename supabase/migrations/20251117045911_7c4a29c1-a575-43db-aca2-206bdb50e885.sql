-- Create signal_theme_map table for mapping signals to themes
CREATE TABLE IF NOT EXISTS public.signal_theme_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  relevance_score NUMERIC DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(signal_id, theme_id)
);

-- Enable RLS
ALTER TABLE public.signal_theme_map ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Signal theme map readable by everyone"
  ON public.signal_theme_map
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage signal theme map"
  ON public.signal_theme_map
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_signal_theme_map_signal_id ON public.signal_theme_map(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_theme_map_theme_id ON public.signal_theme_map(theme_id);
CREATE INDEX IF NOT EXISTS idx_signal_theme_map_created_at ON public.signal_theme_map(created_at DESC);

-- Schedule compute-theme-scores every 15 minutes
SELECT cron.schedule(
  'compute-theme-scores-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/compute-theme-scores',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  ) as request_id;
  $$
);

-- Schedule generate-alerts every 15 minutes (offset by 5 min after theme scoring)
SELECT cron.schedule(
  'generate-alerts-15min',
  '5,20,35,50 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://detxhoqiarohjevedmxh.supabase.co/functions/v1/generate-alerts',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRldHhob3FpYXJvaGpldmVkbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MDIxNDYsImV4cCI6MjA3NjE3ODE0Nn0.fovKuUCw2EZ6HBiQ-ykgLVf2QmkHoA8hCynfFHeD4TQ"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  ) as request_id;
  $$
);