# CHANGELOG: SEC Form 4 Insiders + ETF Flows ETL

## Summary

Added two new ETL modules to unlock **InsiderPoliticianConfirm** and **FlowPressure** scoring components with full idempotency, testing, and integration.

## 1. SEC Form 4 Insiders ETL

**Module:** `backend/etl/sec_form4.py`

### Features
- Fetches recent Form 4 filings from SEC Atom feed
- Parses insider transactions (acquired/disposed)
- Maps transaction codes to signal types:
  - `P` or `A` → `insider_buy` (direction=up)
  - `S` or `D` → `insider_sell` (direction=down)
- Enriches with issuer name, reported holder, shares, price
- Idempotency: `sha256(accession|reportedHolder|ticker|transaction_date|code|shares|price)`
- Citation: Direct SEC filing URL with proper headers (`SEC_USER_AGENT`, `SEC_ACCEPT_LANGUAGE`)

### Limitations
- Only non-derivative transactions processed
- Derivative securities (options, warrants) excluded
- XML parsing simplified (production would need CIK-based URL construction)

### Tests
**File:** `backend/tests/test_sec_form4.py`

✅ XML parsing extracts issuer, holder, transactions  
✅ First run creates signals, second run inserts 0 (idempotent)  
✅ `insider_buy` maps to theme and affects `InsiderPoliticianConfirm` component  
✅ Sale transactions correctly classified as `insider_sell`  

## 2. ETF Flows ETL

**Module:** `backend/etl/etf_flows.py`

### Features
- Reads CSV URLs from `ETF_FLOWS_CSV_URLS` (comma-separated)
- Flexible column detection (case-insensitive): `date`, `ticker`, `flow`
- Computes rolling 60-day z-score per ETF: `(flow - mean) / stdev`
- Emits two signal types:
  - `flow_pressure_etf`: Per-ETF z-score (FlowPressure × 0.5)
  - `flow_pressure`: Sector aggregate z-score (FlowPressure × 1.0)
- Sector mapping via `ETF_SECTOR_MAP_JSON` environment variable
- Idempotency per `(date|ticker|url)` for ETF and `(date|sector|url)` for sector
- Citation: Source CSV URL

### Configuration
**Environment variables:**
```bash
ETF_FLOWS_CSV_URLS=http://example.com/flows1.csv,http://example.com/flows2.csv
ETF_SECTOR_MAP_JSON={"SPY":"Broad Market","QQQ":"Technology","XLE":"Energy"}
```

### Tests
**File:** `backend/tests/test_etf_flows.py`

✅ CSV parsing with flexible column detection  
✅ Z-score computation (positive on inflows, negative on outflows)  
✅ Sector aggregation using sector map  
✅ First run creates signals, second run inserts 0 (idempotent)  
✅ Signals include magnitude, direction, z_score in raw data  

## 3. Integration

**File:** `backend/routers/ingest.py`

### Real-mode pipeline order:
1. Policy feeds ETL
2. **Form 4 insiders ETL** ← new
3. **ETF flows ETL** ← new
4. 13F holdings (via dedicated endpoint)
5. Theme mapper (maps all new signals)

### Endpoint response:
```json
{
  "status": "success",
  "mode": "real",
  "policy_feeds": {...},
  "form4_insiders": {
    "filings_processed": 100,
    "signals_created": 47,
    "signals_skipped": 0
  },
  "etf_flows": {
    "csv_urls_processed": 2,
    "signals_created": 312,
    "signals_skipped": 0
  },
  "theme_mapper": {
    "updated": 15
  }
}
```

## 4. Documentation

**File:** `README.md`

Added sections:
- **SEC Form 4 Insiders**: Source, signal types, raw data, caveats
- **ETF Flows**: Source, z-score computation, sector mapping, CSV schema example, scoring weights

**File:** `backend/.env.example`

Updated with inline comments for `ETF_FLOWS_CSV_URLS` and `ETF_SECTOR_MAP_JSON`.

## Next Steps

### Smoke Tests
```bash
# Start services
make up && make seed

# Run real-mode ingest
curl -X POST "http://localhost:8000/api/ingest/run?mode=real"

# Verify signals created
curl "http://localhost:8000/api/radar/themes?days=30" | jq '.[] | select(.components.InsiderPoliticianConfirm > 0 or .components.FlowPressure > 0)'

# Run backend tests
make test
```

### Production Checklist
- [ ] Configure real SEC Atom feed URLs
- [ ] Configure `ETF_FLOWS_CSV_URLS` with actual data sources
- [ ] Set `ETF_SECTOR_MAP_JSON` with full ETF-to-sector mapping
- [ ] Add rate limiting for SEC API calls (respect 10 req/sec limit)
- [ ] Monitor `oa_citation` quality in production signals

## Signal Type Reference

| Signal Type | Component | Weight | Description |
|-------------|-----------|--------|-------------|
| `insider_buy` | InsiderPoliticianConfirm | 0.8 | Insider acquired shares |
| `insider_sell` | InsiderPoliticianConfirm | 0.8 | Insider disposed shares |
| `flow_pressure` | FlowPressure | 1.0 | Sector aggregate z-score |
| `flow_pressure_etf` | FlowPressure | 0.5 | Per-ETF z-score |
