-- Add unique constraint on theme_id for proper upsert support
ALTER TABLE public.theme_scores ADD CONSTRAINT theme_scores_theme_id_key UNIQUE (theme_id);

-- Drop the old non-unique index since the constraint creates its own
DROP INDEX IF EXISTS idx_theme_scores_theme_id;