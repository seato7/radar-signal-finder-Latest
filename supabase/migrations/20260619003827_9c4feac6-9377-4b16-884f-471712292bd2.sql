ALTER TABLE public.chat_assistant_diagnostics
  ADD COLUMN IF NOT EXISTS search_result_count INTEGER,
  ADD COLUMN IF NOT EXISTS matched_in_result_index INTEGER;