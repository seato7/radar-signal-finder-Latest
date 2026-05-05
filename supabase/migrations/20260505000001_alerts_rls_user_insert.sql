-- Allow authenticated users to insert their own rows into public.alerts.
--
-- Why this is needed:
--   The Themes "Subscribe" button calls the manage-alert-settings edge
--   function, which (since 92eccb8) creates a Supabase JS client with
--   the service-role key, validates the caller's JWT via auth.getClaims,
--   then inserts into public.alerts. In supabase-js v2 the getClaims
--   path causes the underlying GoTrueClient to attach the validated
--   user JWT to subsequent PostgREST requests, so the INSERT is no
--   longer presented under the service-role JWT. The pre-existing
--   policy "Service role can insert alerts" (WITH CHECK
--   auth.jwt() ->> 'role' = 'service_role') therefore does not match,
--   and the row is rejected.
--
-- Architecture:
--   Function-level auth.getClaims is the trust boundary; it verifies
--   the caller's JWT against the asymmetric signing keys and resolves
--   the user_id from the sub claim. The function then inserts that
--   user_id into the row. RLS is defence in depth: even if the
--   function were ever called in a way that let a different value
--   reach the user_id column, this policy would refuse the row
--   because auth.uid() (the JWT subject) would not match.
--
-- Pre-existing policies on public.alerts are unchanged:
--   - "Users can read their own alerts"  SELECT  auth.uid() = user_id
--   - "Users can update their own alerts" UPDATE auth.uid() = user_id
--   - "Service role can insert alerts"   INSERT  auth.jwt() ->> 'role' = 'service_role'
--   The service-role INSERT policy is retained so cron-driven
--   inserts (generate-alerts) continue to work; those run with the
--   service-role JWT and never call getClaims.

CREATE POLICY "Users can insert their own alerts"
  ON public.alerts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
