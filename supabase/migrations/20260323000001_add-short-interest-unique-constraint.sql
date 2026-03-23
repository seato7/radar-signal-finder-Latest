ALTER TABLE short_interest
ADD CONSTRAINT short_interest_ticker_report_date_key
UNIQUE (ticker, report_date);
