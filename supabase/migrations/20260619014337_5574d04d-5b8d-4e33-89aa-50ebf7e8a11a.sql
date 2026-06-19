
ALTER TABLE public.chat_assistant_diagnostics
  ADD COLUMN IF NOT EXISTS query_classification text,
  ADD COLUMN IF NOT EXISTS fabrication_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fabricated_claims text,
  ADD COLUMN IF NOT EXISTS forced_unable_to_verify boolean DEFAULT false;
