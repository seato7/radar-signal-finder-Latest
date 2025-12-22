-- First clean up duplicates, keeping only the most recent report per ticker+report_type
DELETE FROM ai_research_reports a
USING ai_research_reports b
WHERE a.ticker = b.ticker 
  AND a.report_type = b.report_type
  AND a.created_at < b.created_at;

-- Add unique constraint for proper upserts (one report per ticker+report_type)
ALTER TABLE public.ai_research_reports 
ADD CONSTRAINT ai_research_reports_ticker_report_type_key UNIQUE (ticker, report_type);