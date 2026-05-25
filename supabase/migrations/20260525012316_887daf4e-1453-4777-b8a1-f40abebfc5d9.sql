
ALTER TABLE public.theme_analyses
  ADD COLUMN IF NOT EXISTS requested_by uuid;

CREATE INDEX IF NOT EXISTS idx_theme_analyses_requested_by_time
  ON public.theme_analyses (requested_by, generated_at DESC);
