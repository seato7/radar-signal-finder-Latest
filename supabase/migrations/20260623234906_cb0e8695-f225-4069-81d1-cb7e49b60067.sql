
CREATE TABLE public.health_probe_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_name text NOT NULL,
  target text,
  status_code int,
  ok boolean NOT NULL,
  latency_ms int,
  error_body text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_probe_results_created_at ON public.health_probe_results (created_at DESC);
CREATE INDEX idx_health_probe_results_probe_created ON public.health_probe_results (probe_name, created_at DESC);

GRANT SELECT ON public.health_probe_results TO authenticated;
GRANT ALL ON public.health_probe_results TO service_role;
ALTER TABLE public.health_probe_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read health probe results"
  ON public.health_probe_results FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.health_probe_alert_state (
  probe_name text PRIMARY KEY,
  last_alert_sent_at timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.health_probe_alert_state TO authenticated;
GRANT ALL ON public.health_probe_alert_state TO service_role;
ALTER TABLE public.health_probe_alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read health probe alert state"
  ON public.health_probe_alert_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
