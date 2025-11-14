-- ============================================
-- ALERT HISTORY TABLE FOR PERSISTENT LOGGING
-- ============================================

CREATE TABLE IF NOT EXISTS public.alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  function_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX idx_alert_history_created_at ON public.alert_history(created_at DESC);
CREATE INDEX idx_alert_history_function ON public.alert_history(function_name, created_at DESC);
CREATE INDEX idx_alert_history_severity ON public.alert_history(severity, created_at DESC);
CREATE INDEX idx_alert_history_type_function ON public.alert_history(alert_type, function_name, created_at DESC);

-- Enable RLS
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

-- Admin-only read access
CREATE POLICY "Admins can view alert history"
ON public.alert_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Service role can insert (from edge functions)
CREATE POLICY "Service role can insert alerts"
ON public.alert_history FOR INSERT
WITH CHECK (
  (auth.jwt() ->> 'role') = 'service_role'
);

COMMENT ON TABLE public.alert_history IS 'Persistent log of all system alerts. Deduplication handled via application logic.';