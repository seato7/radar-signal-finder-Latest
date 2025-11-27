# Comprehensive Testing Plan - InsiderPulse

## Table of Contents
1. [Backend Edge Functions](#backend-edge-functions)
2. [Data Ingestion Pipeline](#data-ingestion-pipeline)
3. [Frontend User Experience](#frontend-user-experience)
4. [Error Handling & Alerting](#error-handling--alerting)
5. [Authentication & Authorization](#authentication--authorization)
6. [Payment & Subscription System](#payment--subscription-system)
7. [Bot Trading System](#bot-trading-system)
8. [Database Integrity](#database-integrity)
9. [Performance & Scalability](#performance--scalability)
10. [Security Audit](#security-audit)

---

## 1. Backend Edge Functions

### 1.1 Ingestion Functions
Test each ingestion function for:
- ✅ Successful data retrieval
- ✅ Proper data transformation
- ✅ Database insertion
- ✅ Error handling
- ✅ Fallback mechanisms
- ✅ Slack notifications (success/failure)

**Functions to test:**
- [ ] `ingest-prices-yahoo` - Test with multiple tickers (AAPL, MSFT, TSLA, BTC-USD)
- [ ] `ingest-news-sentiment` - Verify sentiment scores and article counts
- [ ] `ingest-form4` - Test SEC Form 4 insider trading data
- [ ] `ingest-13f-holdings` - Test institutional holdings ingestion
- [ ] `ingest-congressional-trades` - Verify congressional trading data
- [ ] `ingest-crypto-onchain` - Test blockchain metrics for BTC, ETH
- [ ] `ingest-pattern-recognition` - Verify technical patterns detected
- [ ] `ingest-advanced-technicals` - Test RSI, MACD, Fibonacci levels
- [ ] `ingest-policy-feeds` - Test policy news aggregation
- [ ] `ingest-forex-technicals` - Test EUR/USD, GBP/USD pairs
- [ ] `ingest-forex-sentiment` - Verify forex sentiment data
- [ ] `ingest-dark-pool` - Test dark pool activity detection
- [ ] `ingest-options-flow` - Verify options flow data
- [ ] `ingest-etf-flows` - Test ETF flow tracking
- [ ] `ingest-breaking-news` - Verify real-time news ingestion
- [ ] `ingest-earnings` - Test earnings surprise data
- [ ] `ingest-economic-calendar` - Verify economic indicators
- [ ] `ingest-cot-reports` - Test CFTC commitment of traders data
- [ ] `ingest-google-trends` - Verify search trend data
- [ ] `ingest-reddit-sentiment` - Test Reddit sentiment analysis
- [ ] `ingest-stocktwits` - Verify social sentiment
- [ ] `ingest-job-postings` - Test job posting growth indicators
- [ ] `ingest-patents` - Verify patent filing data
- [ ] `ingest-supply-chain` - Test supply chain tracking
- [ ] `ingest-ai-research` - Verify AI-generated research reports

**Test Scenarios:**
1. **Normal Operation**: Run each function with valid tickers
2. **Invalid Input**: Test with non-existent tickers (should fail gracefully)
3. **Rate Limiting**: Trigger rate limits to test fallback mechanisms
4. **Network Failures**: Simulate timeouts (if possible)
5. **Duplicate Data**: Verify deduplication logic

### 1.2 Scoring & Alert Functions
- [ ] `compute-theme-scores` - Verify theme score calculations
  - Check component scores (momentum, sentiment, volume)
  - Verify score decay over time
  - Test with different signal types
- [ ] `compute-signal-scores` - Test individual signal scoring
- [ ] `generate-alerts` - Verify alert generation logic
  - Test threshold triggers
  - Verify user-specific alerts based on watchlist
  - Check deduplication (no duplicate alerts)

### 1.3 User-Facing Functions
- [ ] `chat-assistant` - Test AI chat functionality
  - Valid queries with context
  - Invalid/malicious input handling
  - Rate limit handling (429 errors)
  - Payment required handling (402 errors)
- [ ] `manage-payments` - Test Stripe integration
  - Checkout session creation
  - Webhook handling
  - Subscription status updates
  - Payment failures
- [ ] `manage-bots` - Test bot management
  - Bot creation
  - Bot modification
  - Bot deletion
  - Bot execution (paper vs live mode)
- [ ] `run-backtest` - Test backtesting engine
  - Historical data accuracy
  - Strategy performance calculations
  - Edge case handling (insufficient data)

### 1.4 Utility Functions
- [ ] `log-error` - Test error logging
  - Frontend error capture
  - Backend error capture
  - Slack notification delivery
- [ ] `watchdog-ingestion-health` - Test monitoring
  - Stale data detection
  - Alert generation for halted functions
  - SLA breach detection
- [ ] `daily-ingestion-digest` - Test digest generation
  - Summary statistics accuracy
  - Email/Slack delivery

---

## 2. Data Ingestion Pipeline

### 2.1 Data Freshness
Check data staleness for all tables:
```sql
SELECT * FROM view_stale_tickers WHERE seconds_stale > 3600;
```

### 2.2 Ingestion Logs
Review recent ingestion performance:
```sql
SELECT 
  etl_name,
  status,
  COUNT(*) as run_count,
  AVG(duration_seconds) as avg_duration,
  AVG(rows_inserted) as avg_rows
FROM ingest_logs
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY etl_name, status
ORDER BY etl_name;
```

### 2.3 Fallback Usage
Check AI fallback usage:
```sql
SELECT * FROM check_ai_fallback_usage();
```

### 2.4 Data Quality
- [ ] Verify no NULL critical fields (ticker, timestamp, price)
- [ ] Check for duplicate entries
- [ ] Validate data ranges (prices > 0, sentiment scores between -1 and 1)
- [ ] Test referential integrity (asset_id foreign keys)

---

## 3. Frontend User Experience

### 3.1 Authentication Flow
- [ ] **Signup** (`/auth`)
  - Valid email/password
  - Invalid email format
  - Weak password handling
  - Duplicate email error
- [ ] **Login**
  - Valid credentials
  - Invalid credentials
  - "Forgot password" flow
- [ ] **Logout**
  - Session cleanup
  - Redirect to auth page
- [ ] **Protected Routes**
  - Unauthenticated access blocked
  - Redirect to login

### 3.2 Core Pages

#### Home (`/`)
- [ ] Hero section renders
- [ ] Quick stats load correctly
- [ ] Navigation works
- [ ] Responsive design (mobile, tablet, desktop)

#### Assets (`/assets`)
- [ ] Asset list loads
- [ ] Search functionality
- [ ] Filter by asset class (stocks, crypto, forex)
- [ ] Pagination works
- [ ] Click asset → navigates to detail page

#### Asset Detail (`/assets/:id`)
- [ ] Price chart renders
- [ ] Signals display correctly
- [ ] Theme associations shown
- [ ] "Add to Watchlist" works
- [ ] AI research section loads

#### Watchlist (`/watchlist`)
- [ ] User watchlist loads
- [ ] Add/remove assets
- [ ] Real-time updates (if applicable)
- [ ] Notes functionality

#### Themes (`/themes`)
- [ ] Theme list loads
- [ ] Theme scores display
- [ ] Click theme → shows associated assets
- [ ] Subscribe/unsubscribe to themes

#### Radar (`/radar`)
- [ ] Signals feed loads
- [ ] Filter by direction (up/down/neutral)
- [ ] Filter by source
- [ ] Time range selection

#### Alerts (`/alerts`)
- [ ] Alert list loads
- [ ] Mark as read
- [ ] Unread count badge
- [ ] Alert details expand

#### Bots (`/bots`)
- [ ] Bot list loads (if user has bots)
- [ ] Create new bot
- [ ] Edit bot parameters
- [ ] Start/stop bot
- [ ] View bot logs and orders

#### Analytics (`/analytics`)
- [ ] Performance charts render
- [ ] Date range picker works
- [ ] Export functionality

#### Backtest (`/backtest`)
- [ ] Strategy selection
- [ ] Date range input
- [ ] Run backtest
- [ ] Results visualization
- [ ] Performance metrics

#### Settings (`/settings`)
- [ ] Profile update
- [ ] Password change
- [ ] Alert preferences
- [ ] Broker key management
- [ ] API key management

#### Pricing (`/pricing`)
- [ ] Plan comparison displays
- [ ] "Upgrade" buttons work
- [ ] Stripe checkout flow

#### Admin (`/admin`)
- [ ] Only accessible to admin users
- [ ] User management
- [ ] System health dashboard
- [ ] Ingestion status

### 3.3 UI Components
- [ ] **Toast notifications** - Test success, error, info toasts
- [ ] **Modals/Dialogs** - Open, close, form submission
- [ ] **Dropdowns** - Select options, keyboard navigation
- [ ] **Forms** - Validation, error messages, submission
- [ ] **Loading states** - Skeletons, spinners
- [ ] **Error boundaries** - Graceful error handling

### 3.4 Responsive Design
- [ ] Mobile (< 768px)
- [ ] Tablet (768px - 1024px)
- [ ] Desktop (> 1024px)
- [ ] Sidebar collapse on mobile

### 3.5 Performance
- [ ] Page load time < 3 seconds
- [ ] Time to interactive < 5 seconds
- [ ] Smooth scrolling
- [ ] No layout shifts (CLS)

---

## 4. Error Handling & Alerting

### 4.1 Frontend Errors
**Test Scenario**: Intentionally cause a React error
```typescript
// Temporarily add to any component
if (Math.random() > 0.5) {
  throw new Error("TEST: Intentional crash for error boundary");
}
```
- [ ] Error boundary catches error
- [ ] User sees error UI
- [ ] `log-error` function is called
- [ ] Slack alert received with details

### 4.2 Backend Errors
**Test AI Rate Limit (429)**
- [ ] Simulate 429 error in `chat-assistant`
- [ ] Verify Slack alert: "⚠️ WARNING: Rate Limit"
- [ ] User sees toast: "Rate limits exceeded, please try again later"

**Test Payment Error (402)**
- [ ] Simulate 402 error in `manage-payments`
- [ ] Verify Slack alert: "⚠️ WARNING: Payment Required"
- [ ] User sees toast: "Payment required, please add funds"

**Test Generic Errors**
- [ ] Network timeouts
- [ ] Invalid API responses
- [ ] Database connection failures
- [ ] Verify Slack alerts: "🔴 CRITICAL: Runtime Error"

### 4.3 Ingestion Errors
**Test Ingestion Failure**
- [ ] Manually trigger failure (e.g., invalid API key)
- [ ] Verify Slack alert: "🔴 ERROR: ingest-prices-yahoo failed"
- [ ] Check `ingest_failures` table
- [ ] Verify retry mechanism (if applicable)

**Test Fallback Exceeded**
- [ ] Trigger 100% fallback ratio
- [ ] Verify Slack alert: "⚠️ WARNING: Fallback exceeded 80%"

### 4.4 Critical System Alerts
Test watchdog function:
```sql
SELECT * FROM get_stale_functions();
```
- [ ] Verify alerts for halted functions
- [ ] Test SLA breach detection
- [ ] Check duplicate key error alerts
- [ ] Verify empty table alerts

---

## 5. Authentication & Authorization

### 5.1 User Roles
Test role-based access:
- [ ] **Free user** - Limited features, paywalls work
- [ ] **Lite user** - Medium tier access
- [ ] **Pro user** - Full feature access
- [ ] **Admin user** - Admin panel access

### 5.2 RLS Policies
Verify row-level security:
```sql
-- Test as different users
SET ROLE authenticated;
SET request.jwt.claims.sub = 'user-id-here';

-- Should only see own data
SELECT * FROM watchlist;
SELECT * FROM alerts;
SELECT * FROM bots;
SELECT * FROM broker_keys;
```

### 5.3 API Key Management
- [ ] Create API key
- [ ] Use API key for authentication
- [ ] Revoke API key
- [ ] Rate limiting per API key

---

## 6. Payment & Subscription System

### 6.1 Stripe Integration
**Test Checkout Flow**
- [ ] Click "Upgrade to Pro"
- [ ] Redirected to Stripe checkout
- [ ] Complete test payment (use Stripe test card: 4242 4242 4242 4242)
- [ ] Webhook received
- [ ] User role updated in database
- [ ] Redirect back to app

**Test Subscription Management**
- [ ] View current subscription
- [ ] Cancel subscription
- [ ] Reactivate subscription
- [ ] Upgrade/downgrade plan

**Test Webhooks**
- [ ] `checkout.session.completed`
- [ ] `customer.subscription.created`
- [ ] `customer.subscription.updated`
- [ ] `customer.subscription.deleted`
- [ ] `invoice.payment_succeeded`
- [ ] `invoice.payment_failed`

### 6.2 Plan Limits
Test feature limits per plan:
```typescript
// src/lib/planLimits.ts
```
- [ ] Free: Limited bots, watchlist size
- [ ] Lite: Medium limits
- [ ] Pro: High limits
- [ ] Verify paywalls trigger correctly

---

## 7. Bot Trading System

### 7.1 Bot Creation
- [ ] Create bot with valid parameters
- [ ] Select strategy (theme-based, signal-based, custom)
- [ ] Set risk policy (max position size, stop loss)
- [ ] Choose mode (paper vs live)
- [ ] Select broker integration

### 7.2 Bot Execution
**Paper Mode**
- [ ] Bot receives signals
- [ ] Orders generated (not executed)
- [ ] Positions tracked in database
- [ ] PnL calculated

**Live Mode** (if applicable)
- [ ] Bot connects to broker
- [ ] Real orders placed
- [ ] Order confirmation received
- [ ] Positions synced

### 7.3 Broker Integrations
Test each broker:
- [ ] Alpaca
- [ ] Interactive Brokers
- [ ] Binance
- [ ] Coinbase
- [ ] Kraken

**Test Cases**
- [ ] Connect broker (API key validation)
- [ ] Fetch account balance
- [ ] Place order (paper mode)
- [ ] Cancel order
- [ ] Fetch positions
- [ ] Disconnect broker

### 7.4 Bot Logs & Orders
- [ ] View bot execution logs
- [ ] Filter by log level (info, warning, error)
- [ ] View order history
- [ ] Check order status (pending, filled, cancelled)

---

## 8. Database Integrity

### 8.1 Core Tables
Verify data integrity for:
- [ ] `assets` - No duplicate tickers
- [ ] `signals` - Valid asset_id references
- [ ] `themes` - Score calculations correct
- [ ] `prices` - No gaps in daily data
- [ ] `watchlist` - User-specific data isolated
- [ ] `alerts` - Properly associated with themes
- [ ] `bots` - Valid user_id references

### 8.2 Foreign Key Constraints
Test referential integrity:
```sql
-- Should fail (invalid asset_id)
INSERT INTO signals (asset_id, ticker, signal_type) 
VALUES ('non-existent-id', 'AAPL', 'momentum');

-- Should succeed
INSERT INTO signals (asset_id, ticker, signal_type)
VALUES ((SELECT id FROM assets WHERE ticker = 'AAPL'), 'AAPL', 'momentum');
```

### 8.3 Indexes
Verify query performance:
```sql
EXPLAIN ANALYZE SELECT * FROM signals WHERE ticker = 'AAPL';
EXPLAIN ANALYZE SELECT * FROM prices WHERE asset_id = 'uuid-here';
```
- [ ] Index scans used (not sequential scans)
- [ ] Query time < 100ms

### 8.4 Data Backups
- [ ] Daily backups enabled
- [ ] Test restore process
- [ ] Verify backup retention policy

---

## 9. Performance & Scalability

### 9.1 Load Testing
Simulate high traffic:
- [ ] 100 concurrent users
- [ ] 1000 requests/minute
- [ ] Monitor response times
- [ ] Check error rates

### 9.2 Database Performance
- [ ] Connection pool size adequate
- [ ] Slow query log review
- [ ] Index usage optimization
- [ ] Query caching effectiveness

### 9.3 Edge Function Performance
Monitor execution times:
```sql
SELECT 
  function_name,
  AVG(duration_ms) as avg_duration,
  MAX(duration_ms) as max_duration,
  COUNT(*) FILTER (WHERE duration_ms > 5000) as slow_calls
FROM function_status
WHERE executed_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name
ORDER BY avg_duration DESC;
```
- [ ] All functions < 10s average
- [ ] No timeout errors

### 9.4 Caching
- [ ] Redis cache hit rate > 80%
- [ ] Cache invalidation works correctly
- [ ] TTL settings appropriate

---

## 10. Security Audit

### 10.1 Authentication Security
- [ ] Password hashing (bcrypt/argon2)
- [ ] Session management (JWT)
- [ ] CSRF protection
- [ ] Rate limiting on auth endpoints

### 10.2 Data Encryption
- [ ] Broker keys encrypted at rest
- [ ] API keys encrypted
- [ ] Secrets stored in Supabase Vault
- [ ] HTTPS enforced

### 10.3 SQL Injection Prevention
- [ ] Parameterized queries used
- [ ] No raw SQL concatenation
- [ ] Input validation

### 10.4 XSS Prevention
- [ ] React auto-escaping
- [ ] No dangerouslySetInnerHTML (or sanitized)
- [ ] Content Security Policy headers

### 10.5 API Security
- [ ] API key authentication
- [ ] Rate limiting per user
- [ ] Input validation
- [ ] CORS properly configured

### 10.6 Secrets Management
- [ ] No secrets in codebase
- [ ] Environment variables used
- [ ] Supabase Vault for sensitive data
- [ ] Key rotation policy

---

## Testing Execution Checklist

### Pre-Launch
- [ ] Run all backend function tests
- [ ] Complete frontend user flows
- [ ] Verify all Slack alerts working
- [ ] Test error handling scenarios
- [ ] Check data freshness for all tables
- [ ] Run security audit
- [ ] Performance testing
- [ ] Load testing

### Launch Day
- [ ] Monitor Slack alerts
- [ ] Watch database performance
- [ ] Check error rates
- [ ] Monitor API usage
- [ ] Track user signups
- [ ] Verify payment flows

### Post-Launch
- [ ] Daily health checks
- [ ] Weekly performance review
- [ ] Monthly security audit
- [ ] User feedback analysis

---

## Automated Testing Script

```bash
#!/bin/bash
# Quick health check script

echo "=== Backend Health Check ==="
curl -s https://your-project.supabase.co/functions/v1/health-metrics | jq

echo "=== Stale Data Check ==="
psql $DATABASE_URL -c "SELECT * FROM get_stale_functions();"

echo "=== Ingestion Performance ==="
psql $DATABASE_URL -c "SELECT etl_name, status, COUNT(*) FROM ingest_logs WHERE started_at > NOW() - INTERVAL '1 hour' GROUP BY etl_name, status;"

echo "=== Alert Status ==="
curl -s $SLACK_WEBHOOK_URL -X POST -d '{"text":"🧪 Health check completed"}'
```

---

## Critical Issues Checklist

Before launch, ensure ZERO instances of:
- [ ] ❌ Hardcoded API keys
- [ ] ❌ Console.log with sensitive data
- [ ] ❌ Commented-out debug code
- [ ] ❌ TODO/FIXME comments
- [ ] ❌ Unused dependencies
- [ ] ❌ Localhost URLs
- [ ] ❌ Test data in production database
- [ ] ❌ Disabled RLS policies
- [ ] ❌ Missing error handling
- [ ] ❌ Unmonitored edge functions
