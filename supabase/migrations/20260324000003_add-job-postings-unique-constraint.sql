-- Add unique constraint to job_postings matching the ON CONFLICT clause used
-- in ingest-job-postings upsert: onConflict: 'ticker,job_title,company,posted_date'
ALTER TABLE job_postings
  ADD CONSTRAINT job_postings_ticker_job_title_company_posted_date_key
  UNIQUE (ticker, job_title, company, posted_date);
