ALTER TABLE public.chat_assistant_diagnostics
  ADD COLUMN IF NOT EXISTS entity_in_whitelist    boolean,
  ADD COLUMN IF NOT EXISTS whitelist_source       text,
  ADD COLUMN IF NOT EXISTS trusted_result_count   integer,
  ADD COLUMN IF NOT EXISTS rejected_result_count  integer,
  ADD COLUMN IF NOT EXISTS rejected_domains       text;