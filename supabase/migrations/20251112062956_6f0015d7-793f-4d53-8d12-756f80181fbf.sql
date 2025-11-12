-- Create circuit_breaker_status table for monitoring function health
CREATE TABLE IF NOT EXISTS public.circuit_breaker_status (
  function_name TEXT PRIMARY KEY,
  is_open BOOLEAN NOT NULL DEFAULT false,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_slow_calls INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.circuit_breaker_status ENABLE ROW LEVEL SECURITY;

-- Admin-only access policy
CREATE POLICY "Admin can view circuit breaker status"
  ON public.circuit_breaker_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- System can manage circuit breaker status
CREATE POLICY "Service role can manage circuit breaker"
  ON public.circuit_breaker_status
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create index for quick lookups
CREATE INDEX idx_circuit_breaker_function ON public.circuit_breaker_status(function_name);
CREATE INDEX idx_circuit_breaker_open ON public.circuit_breaker_status(is_open) WHERE is_open = true;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_circuit_breaker_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER circuit_breaker_updated_at
  BEFORE UPDATE ON public.circuit_breaker_status
  FOR EACH ROW
  EXECUTE FUNCTION update_circuit_breaker_updated_at();