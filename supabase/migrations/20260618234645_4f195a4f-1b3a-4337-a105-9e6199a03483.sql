ALTER TABLE public.chat_assistant_diagnostics
  ADD COLUMN IF NOT EXISTS cleaned_query text,
  ADD COLUMN IF NOT EXISTS pushback_outcome text;