-- Add unique constraint for signal_generation_diagnostics upsert
ALTER TABLE public.signal_generation_diagnostics 
  ADD CONSTRAINT signal_gen_diag_unique 
  UNIQUE (snapshot_date, generator, excluded_reason);