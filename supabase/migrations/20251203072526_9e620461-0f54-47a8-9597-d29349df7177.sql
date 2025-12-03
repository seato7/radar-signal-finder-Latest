-- Add permissive INSERT policy for ingest_logs (backend logging)
CREATE POLICY "Allow public insert for ingest logs"
ON public.ingest_logs
FOR INSERT
WITH CHECK (true);

-- Also add permissive UPDATE policy for completing logs
CREATE POLICY "Allow public update for ingest logs"
ON public.ingest_logs
FOR UPDATE
USING (true)
WITH CHECK (true);