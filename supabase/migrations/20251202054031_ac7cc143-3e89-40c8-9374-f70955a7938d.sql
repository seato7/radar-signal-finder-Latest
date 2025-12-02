-- Allow service inserts to prices table (for Railway backend)
CREATE POLICY "Allow service inserts to prices"
ON public.prices
FOR INSERT
WITH CHECK (true);

-- Allow service updates to prices table (for Railway backend)  
CREATE POLICY "Allow service updates to prices"
ON public.prices
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Allow service upserts via ON CONFLICT
CREATE POLICY "Allow service deletes to prices"
ON public.prices
FOR DELETE
USING (true);