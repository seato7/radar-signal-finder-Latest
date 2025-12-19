-- Create cusip_mappings table to cache CUSIP to ticker lookups
CREATE TABLE public.cusip_mappings (
  cusip TEXT PRIMARY KEY,
  ticker TEXT,
  company_name TEXT,
  source TEXT NOT NULL DEFAULT 'openfigi',
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cusip_mappings ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "CUSIP mappings readable by everyone"
ON public.cusip_mappings FOR SELECT
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage CUSIP mappings"
ON public.cusip_mappings FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create index for faster lookups
CREATE INDEX idx_cusip_mappings_ticker ON public.cusip_mappings(ticker);