# Alpaca Broker Integration Setup

## Overview
Your Opportunity Radar backend now supports live trading via Alpaca Markets. This integration enables:
- **Stocks**: US equities (NYSE, NASDAQ)
- **Crypto**: BTC, ETH, DOGE, and 10+ other cryptocurrencies
- **Paper Trading**: Test strategies with simulated money
- **Live Trading**: Execute real trades (requires paid subscription plan)

---

## 1. Get Alpaca API Keys

### Sign Up for Alpaca
1. Go to [https://alpaca.markets](https://alpaca.markets)
2. Create a free account
3. Verify your email

### Generate API Keys
1. Log into Alpaca dashboard
2. Navigate to **Paper Trading** section (recommended for testing)
3. Go to **API Keys** under settings
4. Click **Generate New Key**
5. Save both:
   - **API Key ID** (e.g., `PKA...`)
   - **Secret Key** (e.g., `xyz...`)

⚠️ **Important**: Keep your secret key secure! Never commit it to version control.

---

## 2. Configure Railway Environment Variables

Add these to your Railway backend service:

```bash
ALPACA_API_KEY=your_api_key_here
ALPACA_SECRET_KEY=your_secret_key_here
ALPACA_PAPER_MODE=true  # Set to false for live trading
```

### How to Add in Railway:
1. Open your Railway project
2. Select the **backend** service
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add each variable above

---

## 3. Verify Connection

After deploying with the new env vars, test the connection:

```bash
curl https://your-backend.railway.app/api/bots/broker/test
```

**Expected Response** (if configured correctly):
```json
{
  "connected": true,
  "account_number": "PA...",
  "buying_power": "100000.00",
  "cash": "100000.00",
  "portfolio_value": "100000.00",
  "paper_mode": true
}
```

**If not configured**:
```json
{
  "connected": false,
  "error": "Alpaca API keys not configured",
  "configured": false
}
```

---

## 4. Paper vs Live Trading

### Paper Trading (Default)
- ✅ **Free** - No risk
- ✅ Simulated fills with real market data
- ✅ $100,000 starting balance
- ✅ Perfect for strategy testing
- Set: `ALPACA_PAPER_MODE=true`

### Live Trading
- ⚠️ **Real money** - Real risk
- ⚠️ Requires funded Alpaca account
- ⚠️ Requires Starter plan or higher on Opportunity Radar
- Set: `ALPACA_PAPER_MODE=false`

---

## 5. Upgrade Bot to Live Trading

### Prerequisites:
1. ✅ Alpaca account configured
2. ✅ User has Starter/Pro/Premium subscription
3. ✅ Bot has executed at least 5 paper trades (safety check)

### Upgrade Flow:
```bash
POST /api/bots/{bot_id}/upgrade_to_live
```

**Safety Features**:
- Checks subscription tier
- Verifies broker connection
- Requires paper trading history
- Logs upgrade event for audit

---

## 6. Supported Assets

### Stocks
All US equities on NYSE and NASDAQ. Examples:
- AAPL, GOOGL, MSFT, TSLA, NVDA, etc.

### Crypto (24/7 Trading)
- BTC, ETH, LTC, BCH
- DOGE, SHIB, UNI
- AAVE, AVAX, BAT, LINK
- CRV, DOT, GRT, MKR
- USDT

**Note**: Use ticker format like `BTC` or `BTCUSD` - the adapter handles conversion.

---

## 7. Order Execution

### Market Orders (Default)
- Immediate execution at current price
- Works for both stocks and crypto

### Limit Orders
- Specify exact price
- May not fill if price not reached

### Example:
```python
# Buy 1 share of AAPL at market price
await broker.place_order("AAPL", "buy", qty=1)

# Buy $100 worth of Bitcoin
await broker.place_order("BTC", "buy", notional=100)

# Sell with limit price
await broker.place_order("TSLA", "sell", qty=5, order_type="limit", limit_price=250.00)
```

---

## 8. Risk Management Features

All these are enforced by the bot engine:

1. **Max Position Size** - Per bot risk policy
2. **Max Drawdown Circuit Breaker** - Auto-pause if threshold hit
3. **Daily Trade Limits** - Prevent overtrading
4. **Buying Power Check** - Prevent margin calls
5. **Paper-First Policy** - Must test before live

---

## 9. Monitoring Live Bots

### View Live Positions:
```bash
GET /api/bots/{bot_id}/live_positions
```

### Sync from Broker:
```bash
POST /api/bots/{bot_id}/sync_positions
```

### Check Bot Logs:
```bash
GET /api/bots/{bot_id}/logs
```

**Live orders tagged with `[LIVE]` prefix in logs.**

---

## 10. Troubleshooting

### "Alpaca API keys not configured"
- Check Railway env vars are set
- Redeploy backend after adding vars

### "Broker connection failed"
- Verify API keys are correct
- Check you're using Paper keys if `ALPACA_PAPER_MODE=true`
- Ensure keys haven't expired

### "Insufficient buying power"
- Paper account: Default is $100k, should be enough
- Live account: Deposit more funds in Alpaca

### "Live trading requires Starter plan or higher"
- User must upgrade subscription
- Redirect to `/pricing` page

### "Bot must execute at least 5 paper trades"
- Run bot in paper mode first
- Wait for strategy to trigger orders

---

## 11. Security Best Practices

1. ✅ **Never expose API keys** in frontend or logs
2. ✅ **Use paper mode** for all testing
3. ✅ **Start with small positions** when going live
4. ✅ **Monitor bots closely** after live upgrade
5. ✅ **Set conservative risk limits** in bot config
6. ✅ **Rotate API keys regularly** 

---

## 12. Next Steps

1. Add Alpaca API keys to Railway
2. Restart backend service
3. Test connection via `/api/bots/broker/test`
4. Create a bot in paper mode
5. Run strategy and verify trades
6. (Optional) Upgrade to live after testing

---

## Support

- **Alpaca Docs**: https://docs.alpaca.markets
- **Alpaca Support**: support@alpaca.markets
- **API Status**: https://status.alpaca.markets
