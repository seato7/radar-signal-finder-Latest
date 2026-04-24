CREATE TABLE IF NOT EXISTS public.user_asset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_ticker text NOT NULL,
  requested_name text,
  requested_reason text,
  search_query text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'added', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes text
);

CREATE INDEX IF NOT EXISTS idx_user_asset_requests_status
  ON public.user_asset_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_asset_requests_user_id
  ON public.user_asset_requests(user_id);

ALTER TABLE public.user_asset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own requests"
  ON public.user_asset_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users create requests"
  ON public.user_asset_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all requests"
  ON public.user_asset_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update requests"
  ON public.user_asset_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.user_asset_requests IS
  'User-submitted requests for assets missing from the catalogue. Submitted from AssetRadar empty-search state. Admin triage via status field.';