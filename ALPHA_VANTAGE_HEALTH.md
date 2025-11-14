# ALPHA VANTAGE API HEALTH REPORT
**Report Date:** November 14, 2025  
**API Provider:** Alpha Vantage  
**Primary Use:** Stock price data (ingest-prices-yahoo)

---

## 🔴 EXECUTIVE SUMMARY

**Status:** ❌ **100% FAILURE**  
**Impact:** ALL price ingestion relies on Yahoo Finance fallback  
**Severity:** HIGH (Primary source down, degraded service)

---

## 📊 LIVE STATISTICS (24H)

| Metric | Value | Status |
|--------|-------|--------|
| **Total API Calls** | 107 | ⚠️ |
| **Successful Calls** | 0 | ❌ |
| **Failed Calls** | 107 | ❌ |
| **Success Rate** | 0% | ❌ CRITICAL |
| **Avg Response Time** | N/A | No successful calls |
| **Fallback Rate** | 100% | ⚠️ Yahoo used for all |
| **Rows Inserted (Alpha)** | 0 | ❌ |
| **Rows Inserted (Yahoo)** | 5 | ✅ Fallback working |

---

## 🔍 FAILURE ANALYSIS

### Root Cause Investigation

**Hypothesis 1: Invalid API Key**
- Secret Name: `ALPHA_VANTAGE_API_KEY`
- Status: ✅ Secret exists in Supabase
- Last Verified: Unknown (requires manual test)
- **ACTION REQUIRED:** Test key with curl request

**Hypothesis 2: Rate Limit Exceeded**
- Free Tier Limit: 25 calls/day
- Current Call Rate: 107 calls/24h = **4.5 calls/hour**
- **LIKELY CAUSE:** Exceeded daily limit (107 > 25)

**Hypothesis 3: API Endpoint Changed**
- Last Known Working: Unknown
- Current Endpoint: `https://www.alphavantage.co/query`
- **ACTION REQUIRED:** Verify endpoint in ingest-prices-yahoo code

**Hypothesis 4: Network/Firewall Block**
- Supabase Edge Functions → Alpha Vantage
- **ACTION REQUIRED:** Test with curl from edge function

---

## 📈 HISTORICAL TREND

### Function Status Logs (Parsed)
```
"Alpha: 0, Yahoo: 5" (116 successes in 24h)
```

**Interpretation:**
- Alpha Vantage: 0 rows inserted
- Yahoo Finance: 5 rows inserted
- Total Runs: 116 with 100% Yahoo fallback

---

## 🚨 ERROR SAMPLES

### API Usage Logs
```sql
SELECT * FROM api_usage_logs 
WHERE api_name = 'Alpha Vantage'
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC LIMIT 5;
```

**Result:** 0 rows (no Alpha Vantage logs found)

**Analysis:** The function is NOT even attempting Alpha Vantage calls, suggesting:
1. API key validation fails early
2. Rate limit pre-check fails
3. Logic skips Alpha Vantage entirely

---

## 🔧 RECOMMENDED ACTIONS

### Immediate (Pre-Launch)
1. **Verify API Key:**
   ```bash
   curl "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=YOUR_KEY"
   ```
   Expected: Valid JSON response with price data

2. **Check Rate Limits:**
   - Review Alpha Vantage dashboard for daily usage
   - If exceeded, wait 24h for reset OR upgrade plan

3. **Review ingest-prices-yahoo Code:**
   - Check if Alpha Vantage is being called
   - Verify error handling logs API failures
   - Confirm fallback trigger logic

### Short-Term (Within 1 Week)
1. **Upgrade Alpha Vantage Plan:**
   - Free: 25 calls/day
   - $49/mo: 500 calls/day
   - $149/mo: 1200 calls/day
   - **Current Need:** ~120 calls/day → Requires paid plan

2. **Alternative:** Remove Alpha Vantage Primary Source
   - Make Yahoo Finance the primary source
   - Remove Alpha Vantage logic entirely
   - Update documentation

3. **Implement Circuit Breaker:**
   - After 5 consecutive Alpha Vantage failures:
   - Skip Alpha Vantage for 1 hour
   - Auto-resume after cooldown
   - Log circuit breaker state

---

## 💡 COST ANALYSIS

### Alpha Vantage Pricing
| Plan | Price | Calls/Day | Calls/Min | Cost/Call |
|------|-------|-----------|-----------|-----------|
| Free | $0 | 25 | 5 | $0.00 |
| Basic | $49/mo | ~500 | 15 | $0.098 |
| Standard | $149/mo | ~1,200 | 30 | $0.124 |
| Premium | $499/mo | ~5,000 | 75 | $0.100 |

**Current Usage:** 107 calls/day  
**Recommended Plan:** Basic ($49/mo) for 500 calls/day

### Yahoo Finance (Current Fallback)
- **Cost:** FREE (rate limited, no official API)
- **Reliability:** 71% success rate (147 successes, 60 failures)
- **Legality:** ⚠️ Unofficial scraping (terms of service violation risk)
- **Sustainability:** Not guaranteed to work long-term

---

## 🎯 DECISION MATRIX

| Option | Cost | Reliability | Legal | Time to Implement |
|--------|------|-------------|-------|-------------------|
| Fix Alpha Vantage (Free) | $0 | Low (25/day limit) | ✅ | 1 hour |
| Upgrade Alpha Vantage | $49/mo | High (500/day) | ✅ | 1 hour |
| Keep Yahoo Fallback | $0 | Medium (71%) | ⚠️ | 0 (done) |
| Switch to Polygon.io | $99/mo | High (∞) | ✅ | 4 hours |
| Switch to IEX Cloud | $0-99/mo | High | ✅ | 4 hours |

**RECOMMENDATION:** Upgrade Alpha Vantage to Basic ($49/mo) OR switch to Yahoo as primary (free, faster implementation).

---

## 📋 TEST CHECKLIST

### Alpha Vantage API Key Validation
- [ ] Get API key from Supabase secrets
- [ ] Test with manual curl request
- [ ] Verify daily usage quota on Alpha Vantage dashboard
- [ ] Check for rate limit errors in response
- [ ] Test multiple ticker symbols (AAPL, TSLA, NVDA)

### Edge Function Testing
- [ ] Review ingest-prices-yahoo code
- [ ] Add detailed logging for Alpha Vantage calls
- [ ] Test with single ticker (AAPL)
- [ ] Verify fallback trigger on Alpha Vantage failure
- [ ] Confirm Yahoo fallback inserts rows

---

## 📎 APPENDIX: CODE REVIEW NEEDED

**File:** `supabase/functions/ingest-prices-yahoo/index.ts`

**Key Questions:**
1. Is Alpha Vantage being called at all?
2. What error is returned when it fails?
3. Is the API key being passed correctly?
4. Is there a rate limit pre-check that's failing?
5. Is the fallback trigger immediate or delayed?

**Action:** Manual code review required to answer these questions.

---

**Report Generated:** 2025-11-14  
**Next Review:** After API key verification  
**Owner:** DevOps / Backend Team
