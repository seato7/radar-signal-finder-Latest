CREATE POLICY "Users can insert their own alerts"
  ON public.alerts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);