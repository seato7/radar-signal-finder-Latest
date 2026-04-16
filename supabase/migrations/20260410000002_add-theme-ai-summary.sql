-- Add ai_summary column to themes table for Gemini-generated explanations
-- compute-theme-scores writes a 1-sentence AI explanation for non-neutral themes
-- that have significant breaking news flow (>5 signals in 48h).

ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS ai_summary TEXT;
