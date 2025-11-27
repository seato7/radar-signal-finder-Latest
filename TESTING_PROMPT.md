# Comprehensive Testing Prompt

Use this prompt to systematically test the entire InsiderPulse application. Execute each section in order and document results.

---

## Phase 1: Backend Foundation (Critical)

### 1.1 Database Health Check
```sql
-- Check for stale data
SELECT * FROM view_stale_tickers WHERE seconds_stale > 3600;

-- Check ingestion performance (last 24h)
SELECT 
  etl_name,
  status,
  COUNT(*) as runs,
  AVG(duration_seconds) as avg_duration,
  SUM(rows_inserted) as total_rows
FROM ingest_logs
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY etl_name, status
ORDER BY etl_name;

-- Check for halted functions
SELECT * FROM get_stale_functions();

-- Verify no duplicate data
SELECT ticker, date, COUNT(*) 
FROM prices 
GROUP BY ticker, date 
HAVING COUNT(*) > 1;
```

**Expected Results:**
- ✅ No tickers stale > 1 hour
- ✅ All ingestion functions successful in last 24h
- ✅ No halted functions
- ✅ No duplicate price entries

**If Failed:**
- Run specific ingestion functions manually
- Check Slack for error alerts
- Review `ingest_failures` table

---

### 1.2 Core Ingestion Functions
Test each ingestion function individually:

```bash
# Test price ingestion (most critical)
curl -X POST \
  "https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-prices-yahoo" \
  -H "Authorization: Bearer YOUR_KEY"

# Check result
SELECT * FROM prices WHERE ticker = 'AAPL' ORDER BY date DESC LIMIT 5;
```

**Test Matrix:**
| Function | Test Ticker | Expected Result | Slack Alert |
|----------|-------------|-----------------|-------------|
| ingest-prices-yahoo | AAPL, MSFT, BTC-USD | Prices inserted | ✅ Success |
| ingest-news-sentiment | AAPL | Sentiment scores | ✅ Success |
| ingest-form4 | AAPL | Insider trades | ✅ Success |
| ingest-13f-holdings | - | Institutional data | ✅ Success |
| ingest-congressional-trades | - | Congress trades | ✅ Success |
| ingest-crypto-onchain | BTC-USD | Blockchain metrics | ✅ Success |
| ingest-pattern-recognition | AAPL | Patterns detected | ✅ Success |
| ingest-advanced-technicals | AAPL | RSI, MACD values | ✅ Success |
| ingest-policy-feeds | - | Policy articles | ✅ Success |
| ingest-forex-technicals | EUR/USD | Forex indicators | ✅ Success |
| ingest-forex-sentiment | EUR/USD | Forex sentiment | ✅ Success |
| ingest-dark-pool | AAPL | Dark pool activity | ✅ Success |

**For Each Function:**
1. Trigger manually
2. Wait for Slack notification
3. Query database to verify data
4. Check execution time < 30s
5. Verify no errors in logs

---

### 1.3 Scoring & Alert System

```sql
-- Trigger theme scoring
SELECT * FROM supabase.functions.invoke('compute-theme-scores');

-- Check theme scores updated
SELECT id, name, score, updated_at 
FROM themes 
ORDER BY updated_at DESC 
LIMIT 10;

-- Trigger alert generation
SELECT * FROM supabase.functions.invoke('generate-alerts');

-- Verify alerts created
SELECT COUNT(*), user_id, theme_name 
FROM alerts 
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY user_id, theme_name;
```

**Expected Results:**
- ✅ Theme scores > 0 for active themes
- ✅ Alerts generated for users with matching watchlists
- ✅ No duplicate alerts
- ✅ Slack notifications sent

---

## Phase 2: Error Handling & Alerting (Critical)

### 2.1 Frontend Error Capture
**Test React Error Boundary:**

1. Temporarily add to any component:
```typescript
// In src/components/ErrorBoundary.tsx or any component
const CrashButton = () => {
  const [crash, setCrash] = React.useState(false);
  if (crash) throw new Error("TEST: Intentional frontend crash");
  return <button onClick={() => setCrash(true)}>Trigger Test Error</button>;
};
```

2. Click the crash button
3. **Expected Results:**
   - ✅ Error boundary displays fallback UI
   - ✅ Slack alert received: "🔴 CRITICAL Frontend Error"
   - ✅ Alert includes error message, URL, user info
   - ✅ Error logged to `alert_history` table

---

### 2.2 Backend Error Scenarios

**Test AI Rate Limit (429):**
```typescript
// Manually trigger in chat-assistant
const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  headers: { Authorization: "Bearer invalid-key" }
});
// Should return 429 after rate limit
```

**Expected Results:**
- ✅ User sees toast: "Rate limits exceeded, please try again later"
- ✅ Slack alert: "⚠️ WARNING Edge Function Error: chat-assistant"
- ✅ Alert shows "Rate Limit" error type

**Test Payment Error (402):**
```typescript
// Simulate in manage-payments
// Attempt action with insufficient credits
```

**Expected Results:**
- ✅ User sees toast: "Payment required, please add funds"
- ✅ Slack alert: "⚠️ WARNING: Payment Required"

---

### 2.3 Ingestion Failure Test

**Intentionally Fail an Ingestion:**
```bash
# Temporarily break ingest-policy-feeds
# Method 1: Invalid URL in function
# Method 2: Revoke API key temporarily

# Trigger function
curl -X POST "https://detxhoqiarohjevedmxh.supabase.co/functions/v1/ingest-policy-feeds"
```

**Expected Results:**
- ✅ Function fails gracefully
- ✅ Slack alert: "🔴 ERROR: ingest-policy-feeds failed"
- ✅ Error details in alert (error message, timestamp)
- ✅ Entry in `ingest_failures` table
- ✅ No app-wide crash

---

### 2.4 Critical System Alerts

**Test Staleness Detection:**
```sql
-- Simulate stale function (stop cron for 2 hours)
-- Then run watchdog
SELECT * FROM supabase.functions.invoke('watchdog-ingestion-health');
```

**Expected Results:**
- ✅ Slack alert: "⚠️ STALE DATA: ingest-prices-yahoo"
- ✅ Alert lists minutes stale
- ✅ Alert severity based on staleness (WARNING vs CRITICAL)

---

## Phase 3: Frontend User Experience

### 3.1 Authentication Flow

**Test Signup:**
1. Navigate to `/auth`
2. Enter: test-user-{timestamp}@example.com
3. Password: TestPass123!
4. **Expected Results:**
   - ✅ Email confirmation sent (auto-confirmed if configured)
   - ✅ Redirect to app
   - ✅ User created in database
   - ✅ Default role assigned (free)

**Test Login:**
1. Logout
2. Login with test credentials
3. **Expected Results:**
   - ✅ Session created
   - ✅ Redirect to home page
   - ✅ User data loads

**Test Protected Routes:**
1. Logout
2. Try to access `/dashboard`
3. **Expected Results:**
   - ✅ Redirect to `/auth`
   - ✅ No console errors

---

### 3.2 Core Page Functionality

**Home Page (`/`):**
- [ ] Hero section displays
- [ ] Stats cards show data (not 0s or "undefined")
- [ ] Navigation menu works
- [ ] Mobile responsive (test on phone simulator)

**Assets Page (`/assets`):**
1. Navigate to `/assets`
2. **Expected Results:**
   - [ ] Asset list loads (at least 10 assets)
   - [ ] Search box works (try "AAPL")
   - [ ] Filter by asset class works
   - [ ] Click asset → navigate to detail page
   - [ ] No loading spinners stuck

**Asset Detail Page (`/assets/:id`):**
1. Click on AAPL
2. **Expected Results:**
   - [ ] Price chart renders
   - [ ] Latest price displayed
   - [ ] Signals section shows signals
   - [ ] Themes section shows associated themes
   - [ ] "Add to Watchlist" button works
   - [ ] AI Research tab loads (if available)

**Watchlist Page (`/watchlist`):**
1. Add AAPL to watchlist
2. Navigate to `/watchlist`
3. **Expected Results:**
   - [ ] AAPL appears in list
   - [ ] Can add notes
   - [ ] Can remove from watchlist
   - [ ] Real-time price updates (if enabled)

**Themes Page (`/themes`):**
1. Navigate to `/themes`
2. **Expected Results:**
   - [ ] Theme list loads
   - [ ] Scores display (0-100)
   - [ ] Click theme → shows associated assets
   - [ ] Subscribe/unsubscribe button works

**Radar Page (`/radar`):**
1. Navigate to `/radar`
2. **Expected Results:**
   - [ ] Signals feed loads
   - [ ] Filter by direction (up/down/neutral)
   - [ ] Filter by source (13F, Form4, etc.)
   - [ ] Date range picker works

**Alerts Page (`/alerts`):**
1. Trigger alert generation (ensure user has watchlist items)
2. Navigate to `/alerts`
3. **Expected Results:**
   - [ ] Alert list loads
   - [ ] Unread badge shows count
   - [ ] Mark as read works
   - [ ] Alert details expand

**Bots Page (`/bots`):**
1. Navigate to `/bots`
2. **Expected Results:**
   - [ ] Bot list loads (or "Create first bot" CTA)
   - [ ] Create bot modal opens
   - [ ] Can configure bot parameters
   - [ ] Can start/stop bot
   - [ ] View bot logs

**Analytics Page (`/analytics`):**
1. Navigate to `/analytics`
2. **Expected Results:**
   - [ ] Performance charts render
   - [ ] Date range picker works
   - [ ] Export button works

**Backtest Page (`/backtest`):**
1. Navigate to `/backtest`
2. Select strategy and date range
3. Click "Run Backtest"
4. **Expected Results:**
   - [ ] Loading state shown
   - [ ] Results display after completion
   - [ ] Performance metrics calculated
   - [ ] Visualization renders

**Settings Page (`/settings`):**
1. Navigate to `/settings`
2. **Expected Results:**
   - [ ] Profile section shows user data
   - [ ] Can update email/password
   - [ ] Alert preferences work
   - [ ] API key management works
   - [ ] Broker key section works

**Pricing Page (`/pricing`):**
1. Navigate to `/pricing`
2. **Expected Results:**
   - [ ] Plan comparison table displays
   - [ ] "Upgrade" buttons work
   - [ ] Clicking upgrade → Stripe checkout

**Admin Page (`/admin`):**
1. Login as admin user
2. Navigate to `/admin`
3. **Expected Results:**
   - [ ] Admin panel loads
   - [ ] User management section works
   - [ ] System health metrics display
   - [ ] Ingestion status dashboard

---

### 3.3 UI Components

**Toast Notifications:**
```typescript
// Trigger test toasts
toast.success("Test success message");
toast.error("Test error message");
toast.info("Test info message");
```
- [ ] Toasts display correctly
- [ ] Auto-dismiss after timeout
- [ ] Can manually dismiss

**Modals:**
- [ ] Open modal
- [ ] Close modal (X button, outside click, ESC key)
- [ ] Form submission works
- [ ] No body scroll when modal open

**Loading States:**
- [ ] Skeleton loaders display during data fetch
- [ ] Spinners show during async operations
- [ ] No "flash of unstyled content"

---

### 3.4 Responsive Design

Test on:
1. **Mobile (375px width)**
   - [ ] Sidebar collapses to hamburger menu
   - [ ] Tables scroll horizontally
   - [ ] Forms are usable
   - [ ] Buttons are tappable (44px min)

2. **Tablet (768px width)**
   - [ ] Layout adapts
   - [ ] Sidebar toggles
   - [ ] Charts resize properly

3. **Desktop (1920px width)**
   - [ ] Full layout displays
   - [ ] No excessive whitespace
   - [ ] Content centered or justified

---

## Phase 4: Payment & Subscription

### 4.1 Stripe Checkout Flow

**Test Upgrade:**
1. Login as free user
2. Navigate to `/pricing`
3. Click "Upgrade to Pro"
4. **Stripe Test Card:**
   - Card: 4242 4242 4242 4242
   - Exp: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits
5. Complete payment
6. **Expected Results:**
   - [ ] Redirected to success page
   - [ ] Webhook received by app
   - [ ] User role updated to 'pro' in database
   - [ ] Slack notification of successful payment
   - [ ] Can now access pro features

**Test Failed Payment:**
1. Use decline test card: 4000 0000 0000 0002
2. **Expected Results:**
   - [ ] Payment fails gracefully
   - [ ] User sees error message
   - [ ] User role unchanged
   - [ ] No partial database updates

---

### 4.2 Subscription Management

**Test Customer Portal:**
1. Navigate to `/settings`
2. Click "Manage Subscription"
3. **Expected Results:**
   - [ ] Redirected to Stripe customer portal
   - [ ] Can view invoices
   - [ ] Can cancel subscription
   - [ ] Can update payment method

**Test Cancellation:**
1. Cancel subscription in Stripe portal
2. **Expected Results:**
   - [ ] Webhook received
   - [ ] User role downgraded at end of period
   - [ ] User notified via email/alert

---

## Phase 5: Bot Trading System

### 5.1 Bot Creation & Execution

**Create Paper Trading Bot:**
1. Navigate to `/bots`
2. Click "Create Bot"
3. Configure:
   - Name: "Test Theme Bot"
   - Strategy: "Theme-based"
   - Theme: "AI & Automation"
   - Mode: "Paper"
   - Risk: Max position 5%, Stop loss 2%
4. **Expected Results:**
   - [ ] Bot created in database
   - [ ] Bot status: "idle"
   - [ ] No errors in creation

**Start Bot:**
1. Click "Start Bot"
2. Wait 5 minutes
3. **Expected Results:**
   - [ ] Bot status: "running"
   - [ ] Bot logs show activity
   - [ ] Orders generated (paper mode, not executed)
   - [ ] Positions tracked in `bot_positions`

**Check Bot Logs:**
```sql
SELECT * FROM bot_logs WHERE bot_id = 'bot-id' ORDER BY created_at DESC;
```
- [ ] Logs show signal processing
- [ ] Logs show order generation
- [ ] No error-level logs (unless expected)

---

### 5.2 Broker Integration

**Test Alpaca Connection:**
1. Navigate to `/settings` → Broker Keys
2. Add Alpaca keys (use paper trading keys)
3. **Expected Results:**
   - [ ] Keys encrypted and stored
   - [ ] Connection test successful
   - [ ] Can fetch account balance

**Test Order Placement (Paper Mode):**
1. Create bot with Alpaca integration
2. Ensure bot generates buy signal
3. **Expected Results:**
   - [ ] Order sent to Alpaca API
   - [ ] Order ID returned
   - [ ] Order tracked in `bot_orders`
   - [ ] Position updated in `bot_positions`

---

## Phase 6: Security & Performance

### 6.1 Authentication Security

**Test Password Requirements:**
1. Try weak password: "123"
2. **Expected Results:**
   - [ ] Validation error
   - [ ] Cannot create account

**Test SQL Injection:**
1. Try malicious input in search: `'; DROP TABLE users; --`
2. **Expected Results:**
   - [ ] Input sanitized
   - [ ] No database error
   - [ ] No data loss

**Test XSS:**
1. Try `<script>alert('XSS')</script>` in text field
2. **Expected Results:**
   - [ ] Rendered as plain text
   - [ ] No script execution

---

### 6.2 Performance Testing

**Measure Page Load:**
```bash
# Use Lighthouse or WebPageTest
lighthouse https://your-app.com --view

# Or Chrome DevTools:
# Network tab → Disable cache → Reload
# Check:
# - Time to Interactive < 5s
# - Largest Contentful Paint < 2.5s
# - Cumulative Layout Shift < 0.1
```

**Load Testing:**
```bash
# Use tools like Apache Bench or k6
ab -n 1000 -c 100 https://your-app.com/api/assets

# Expected:
# - 95th percentile response time < 500ms
# - Error rate < 1%
```

---

### 6.3 Database Performance

**Check Slow Queries:**
```sql
-- Enable pg_stat_statements
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;
```
- [ ] No queries > 1s average
- [ ] Add indexes if needed

---

## Phase 7: Final Pre-Launch Checks

### 7.1 Critical Issues Checklist

Verify ZERO instances of:
- [ ] ❌ Hardcoded API keys in code
- [ ] ❌ Console.log with sensitive data
- [ ] ❌ Localhost URLs in production
- [ ] ❌ Test data in production database
- [ ] ❌ Disabled RLS policies
- [ ] ❌ TODO/FIXME comments
- [ ] ❌ Unused dependencies (run `npm prune`)
- [ ] ❌ Missing error handling
- [ ] ❌ Exposed secrets in client-side code

---

### 7.2 Monitoring Setup

**Verify Slack Alerts:**
```sql
-- Check recent alerts
SELECT 
  function_name,
  alert_type,
  severity,
  COUNT(*) as alert_count,
  MAX(created_at) as last_alert
FROM alert_history
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name, alert_type, severity
ORDER BY last_alert DESC;
```
- [ ] Alerts sent for all critical events
- [ ] No missing alert types

**Set Up Daily Digest:**
- [ ] Enable `daily-ingestion-digest` cron
- [ ] Verify email delivery
- [ ] Check digest content accuracy

---

### 7.3 Documentation

Ensure documentation exists for:
- [ ] API endpoints
- [ ] Database schema
- [ ] Edge function purposes
- [ ] Environment variables
- [ ] Deployment process
- [ ] Troubleshooting guide

---

## Post-Launch Monitoring

### Day 1
- [ ] Monitor Slack for critical alerts
- [ ] Check user signup rate
- [ ] Verify payment flows working
- [ ] Review error logs
- [ ] Check database size growth

### Week 1
- [ ] Review all edge function performance
- [ ] Check for slow queries
- [ ] Analyze user behavior
- [ ] Address user feedback
- [ ] Optimize based on metrics

### Month 1
- [ ] Security audit
- [ ] Performance optimization
- [ ] Feature usage analysis
- [ ] Cost optimization
- [ ] Scalability planning

---

## Emergency Procedures

### If Critical Failure Detected

1. **Check Slack Alerts**
   - Identify failing component
   - Assess severity

2. **Immediate Actions**
   - Disable failing edge function if needed
   - Switch to fallback mode
   - Notify users if necessary

3. **Debugging**
   - Review function logs
   - Check database status
   - Test API connections
   - Verify secrets valid

4. **Resolution**
   - Apply hotfix
   - Test thoroughly
   - Re-enable function
   - Monitor closely

5. **Post-Mortem**
   - Document incident
   - Identify root cause
   - Implement prevention measures
   - Update runbooks

---

## Testing Sign-Off

Before deploying to production, confirm:

**Backend:** ✅
- [ ] All ingestion functions working
- [ ] Scoring system accurate
- [ ] Alert generation functioning
- [ ] API integrations active

**Frontend:** ✅
- [ ] All pages load correctly
- [ ] User flows completed
- [ ] No console errors
- [ ] Responsive design verified

**Error Handling:** ✅
- [ ] Frontend errors captured
- [ ] Backend errors alerted
- [ ] Ingestion failures handled
- [ ] All Slack alerts working

**Security:** ✅
- [ ] RLS policies enabled
- [ ] Secrets encrypted
- [ ] Input validation present
- [ ] Authentication secure

**Performance:** ✅
- [ ] Page load < 3s
- [ ] API response < 500ms
- [ ] Database optimized
- [ ] No memory leaks

**Monitoring:** ✅
- [ ] Slack alerts configured
- [ ] Logs aggregated
- [ ] Metrics tracked
- [ ] Dashboards created

---

**Final Approval:**

Signed: ___________________  
Date: ___________________  
Launch Authorized: [ ] YES [ ] NO
