-- Create ETF Flows table for storing ETF flow data
CREATE TABLE public.etf_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  asset_id UUID REFERENCES public.assets(id),
  flow_date DATE NOT NULL,
  inflow NUMERIC,
  outflow NUMERIC,
  net_flow NUMERIC,
  aum NUMERIC,
  volume BIGINT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(ticker, flow_date)
);

-- Enable RLS
ALTER TABLE public.etf_flows ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "ETF flows readable by everyone"
ON public.etf_flows
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage ETF flows"
ON public.etf_flows
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create index for faster queries
CREATE INDEX idx_etf_flows_ticker_date ON public.etf_flows(ticker, flow_date DESC);
CREATE INDEX idx_etf_flows_asset_id ON public.etf_flows(asset_id);