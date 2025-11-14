# ALPHA VANTAGE DIAGNOSTIC & RECOVERY PLAN
**Issue ID:** ALPHA-001  
**Priority:** HIGH (Non-Blocking)  
**Status:** 100% Yahoo Fallback Active  
**Impact:** Primary API source down, degraded performance

---

## 🔴 CURRENT STATE

**Evidence from Logs (24h):**
- ✅ ingest-prices-yahoo: 127 runs, 100% success
- ❌ Alpha Vantage API: 0 successful calls logged
- ✅ Yahoo Finance: 5 rows inserted (100% fallback rate)
- ⚠️ No Alpha Vantage errors in api_usage_logs (not even attempted)

**Hypothesis:** Function is NOT calling Alpha Vantage at all, likely:
1. API key validation fails early (before HTTP call)
2. Rate limit pre-check fails
3. Logic error skips Alpha Vantage entirely

---

## 🧪 DIAGNOSTIC TEST DEPLOYED

### Test Function: `test-alpha-vantage`

**URL:**
```bash
curl -X POST https://detxhoqiarohjevedmxh.supabase.co/functions/v1/test-alpha-vantage
```

**What It Tests:**
1. ✅ API key configured in secrets
2. ✅ Live API calls to Alpha Vantage (MSFT, AAPL, TSLA)
3. ✅ Rate limit detection
4. ✅ Response parsing
5. ✅ Error message extraction

**Test Duration:** ~45 seconds (15s delay between calls)

---

## 📊 POSSIBLE OUTCOMES

### Outcome 1: API Key Valid, Data Returned ✅
**Response:**
```json
{
  "success": true,
  "api_key_valid": true,
  "successful_calls": 3,
  "recommendation": "✅ API working perfectly",
  "results": [
    {
      "symbol": "MSFT",
      "has_time_series": true,
      "data_points": 100,
      "sample_price": "420.50"
    }
  ]
}
```

**Root Cause:** ingest-prices-yahoo logic error (API works but not called)

**Fix Required:**
1. Review ingest-prices-yahoo/index.ts lines 1-200
2. Check if Alpha Vantage is being skipped
3. Add logging: "Attempting Alpha Vantage for {ticker}"
4. Verify API key is passed correctly to fetch()

---

### Outcome 2: Rate Limit Exceeded ⚠️
**Response:**
```json
{
  "success": false,
  "api_key_valid": true,
  "rate_limited_calls": 3,
  "recommendation": "⚠️ API key valid but rate limited"
}
```

**Root Cause:** Free tier limit exceeded (25 calls/day)

**Current Usage:** 127 runs/day >> 25 calls/day

**Fix Options:**
1. **Upgrade Plan** ($49/mo for 500 calls/day)
   - Pros: Reliable, official support
   - Cons: Recurring cost
   - Recommended for production

2. **Reduce Call Frequency**
   - Change cron from every 15min to hourly
   - Reduce from 127 calls/day to ~24 calls/day
   - Pros: Free
   - Cons: Stale data (1h latency)

3. **Keep Yahoo as Primary**
   - Remove Alpha Vantage entirely
   - Use Yahoo Finance as sole source
   - Pros: Free, already working
   - Cons: Unofficial, legal gray area

**Recommendation:** Option 1 (Upgrade) for production reliability

---

### Outcome 3: Invalid API Key ❌
**Response:**
```json
{
  "success": false,
  "api_key_valid": false,
  "failed_calls": 3,
  "recommendation": "❌ API key invalid or expired"
}
```

**Root Cause:** Key expired, revoked, or typo

**Fix Required:**
1. Get new key from https://www.alphavantage.co/support/#api-key
2. Update Supabase secret:
   ```
   Project Settings → Edge Functions → Secrets
   → ALPHA_VANTAGE_API_KEY → Edit
   ```
3. Redeploy ingest-prices-yahoo
4. Test again

---

### Outcome 4: Network Error 🌐
**Response:**
```json
{
  "success": false,
  "error": "Failed to fetch",
  "results": [
    {"symbol": "MSFT", "error": "Network timeout"}
  ]
}
```

**Root Cause:** Firewall, DNS, or Alpha Vantage outage

**Fix Required:**
1. Check Alpha Vantage status page
2. Test from different network
3. Review Supabase Edge Function network policies
4. Check if alpha.vantage.co is blocked

---

## 🔧 RECOMMENDED TESTING SEQUENCE

### Step 1: Run Diagnostic (NOW)
```bash
curl -X POST https://detxhoqiarohjevedmxh.supabase.co/functions/v1/test-alpha-vantage
```
**Time:** 45 seconds  
**Expected:** JSON response with diagnosis

### Step 2: Analyze Results (2 min)
- Read JSON response
- Identify which outcome matches
- Note specific error messages

### Step 3: Apply Fix (5-30 min)
- Follow fix instructions for your outcome
- Update secrets if needed
- Redeploy functions if needed

### Step 4: Verify Fix (5 min)
- Re-run diagnostic test
- Check api_usage_logs for Alpha Vantage entries:
  ```sql
  SELECT * FROM api_usage_logs 
  WHERE api_name = 'Alpha Vantage'
  ORDER BY created_at DESC LIMIT 10;
  ```
- Should see new logs with status 'success'

### Step 5: Monitor Production (24h)
- Check function_status for ingest-prices-yahoo
- Verify fallback_used = NULL or 'Alpha Vantage' (not 'Yahoo')
- Confirm rows_inserted > 0

---

## 📈 SUCCESS METRICS

After fix is applied, you should see:

**In api_usage_logs:**
```sql
-- Should return rows with Alpha Vantage
SELECT 
  api_name,
  status,
  COUNT(*) as calls
FROM api_usage_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND api_name = 'Alpha Vantage'
GROUP BY api_name, status;
```

**Expected:** 
- Alpha Vantage: success: 5+ calls

**In function_status:**
```sql
-- Should show Alpha Vantage as source
SELECT 
  function_name,
  source_used,
  fallback_used,
  rows_inserted
FROM function_status
WHERE function_name = 'ingest-prices-yahoo'
  AND executed_at > NOW() - INTERVAL '1 hour'
ORDER BY executed_at DESC
LIMIT 5;
```

**Expected:**
- source_used: 'Alpha Vantage'
- fallback_used: NULL or false
- rows_inserted: 5+

---

## 💡 DECISION TREE

```
Run test-alpha-vantage
├─ API key valid + data returned
│  └─ Fix: Review ingest-prices-yahoo logic
├─ API key valid + rate limited
│  ├─ Option A: Upgrade to paid ($49/mo)
│  ├─ Option B: Reduce frequency to hourly
│  └─ Option C: Remove Alpha Vantage, use Yahoo only
├─ API key invalid
│  └─ Fix: Get new key + update secret
└─ Network error
   └─ Fix: Check firewall + Alpha Vantage status
```

---

## ⏱️ TIME ESTIMATES

| Action | Time | Complexity |
|--------|------|------------|
| Run diagnostic test | 1 min | Easy |
| Analyze results | 2 min | Easy |
| Fix invalid API key | 10 min | Easy |
| Fix rate limit (upgrade) | 15 min | Medium |
| Fix rate limit (reduce freq) | 5 min | Easy |
| Review function logic | 30 min | Hard |
| Verify fix | 5 min | Easy |
| **TOTAL (worst case)** | 68 min | - |

---

## 🚦 LAUNCH DECISION

**Question:** Can we launch without Alpha Vantage?

**Answer:** ✅ YES, BUT WITH CAVEATS

**Pros of Launching Now:**
- Yahoo fallback is 100% operational (127/127 successes)
- Data is being ingested (5 rows/run)
- No data loss or corruption
- System is functional

**Cons of Launching Now:**
- Legal risk (Yahoo scraping violates ToS)
- Yahoo could block us anytime
- Slower than Alpha Vantage (no rate limits)
- No official support

**Recommendation:**
1. ✅ Launch with Yahoo fallback
2. ⚠️ Fix Alpha Vantage within 48h post-launch
3. 📊 Monitor Yahoo reliability (expect 70-90% uptime)
4. 🔔 Set up alert if Yahoo fails (already configured)

---

## 📝 POST-LAUNCH ACTION ITEMS

### Within 24h
- [ ] Run test-alpha-vantage
- [ ] Document findings
- [ ] Apply appropriate fix

### Within 48h
- [ ] Verify Alpha Vantage working
- [ ] Reduce Yahoo fallback to <10%
- [ ] Update ALPHA_VANTAGE_HEALTH.md

### Within 7 Days
- [ ] Monitor api_usage_logs daily
- [ ] Track fallback ratio (target <5%)
- [ ] Confirm no rate limit errors

---

**Diagnostic Plan Created:** 2025-11-14 04:20 UTC  
**Estimated Time to Resolution:** 1-2 hours  
**Owner:** DevOps Team  
**Priority:** HIGH (Non-Blocking for Launch)
