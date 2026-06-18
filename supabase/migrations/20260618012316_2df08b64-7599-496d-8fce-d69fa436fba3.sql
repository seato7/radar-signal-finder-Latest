ALTER TABLE public.chat_assistant_diagnostics
  ADD COLUMN IF NOT EXISTS tavily_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS firecrawl_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS gemini_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS total_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS confidence_downgraded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entity_match_found BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS search_skipped_reason TEXT,
  ADD COLUMN IF NOT EXISTS primary_entity TEXT;