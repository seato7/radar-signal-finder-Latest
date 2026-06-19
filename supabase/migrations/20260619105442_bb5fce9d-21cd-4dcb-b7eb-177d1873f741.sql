ALTER TABLE public.chat_assistant_diagnostics
  ADD COLUMN IF NOT EXISTS skipped_fabrication_gate boolean,
  ADD COLUMN IF NOT EXISTS citations_present boolean,
  ADD COLUMN IF NOT EXISTS inherited_entity_from_prior boolean;