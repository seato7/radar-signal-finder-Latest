-- Enable real-time on the prices table for live updates across the app
ALTER TABLE public.prices REPLICA IDENTITY FULL;

-- Add prices table to the real-time publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.prices;