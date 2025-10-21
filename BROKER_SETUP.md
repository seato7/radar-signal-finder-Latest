# Multi-Broker Integration Guide

## Overview

Opportunity Radar supports **Model 1: User API Keys** across multiple major brokers. Users connect their own broker accounts, maintain full control of their funds, and the platform executes trades on their behalf using encrypted API keys.

## Supported Brokers

### 1. Alpaca Markets 🇺🇸
- **Assets**: US Stocks, Crypto
- **Paper Trading**: ✅ Yes
- **Best For**: US traders, beginners, paper testing
- **API Docs**: [alpaca.markets/docs](https://alpaca.markets/docs)

### 2. Interactive Brokers (IBKR) 🌍
- **Assets**: Global Stocks, Options, Futures, Forex
- **Paper Trading**: ✅ Yes
- **Best For**: Professional traders, international markets
- **API Docs**: [interactivebrokers.com/api](https://interactivebrokers.com/api)

### 3. Coinbase 🪙
- **Assets**: Cryptocurrency
- **Paper Trading**: ❌ No
- **Best For**: US crypto traders, institutional
- **API Docs**: [docs.coinbase.com](https://docs.coinbase.com)

### 4. Binance 🪙
- **Assets**: Cryptocurrency
- **Paper Trading**: ✅ Yes (Testnet)
- **Best For**: Global crypto traders, high volume
- **API Docs**: [binance-docs.github.io](https://binance-docs.github.io)

### 5. Kraken 🪙
- **Assets**: Cryptocurrency
- **Paper Trading**: ❌ No
- **Best For**: European crypto traders, security-focused
- **API Docs**: [docs.kraken.com](https://docs.kraken.com)

## Why Model 1?

✅ **No Regulatory Burden** - Platform never touches user money  
✅ **Zero Liability** - Funds stay in user's broker account  
✅ **User Trust** - Full control and visibility  
✅ **Scalability** - No limit on users or capital  
✅ **Multi-Broker** - Users can connect multiple accounts  

## User Flow

### 1. Sign Up & Subscribe
Users create an account and choose a subscription plan.

### 2. Connect Broker Account
Navigate to **Settings → Connect Broker Account**:
1. Select broker from dropdown
2. Enter API Key
3. Enter Secret Key
4. Choose Paper/Live mode (if supported)
5. Click "Connect Broker"

### 3. Create Trading Bot
Once broker is connected:
- Create bots with strategies
- Bot will trade using your connected broker
- View positions in broker's own dashboard

## Getting API Keys by Broker

### Alpaca
1. Sign up at [alpaca.markets](https://alpaca.markets)
2. Go to Dashboard → API Keys
3. Generate new key with "Trading" permissions
4. Copy both API Key and Secret (shown once!)
5. Paper keys start with "PK", Live keys start with "AK"

### Interactive Brokers
1. Open IBKR account at [interactivebrokers.com](https://interactivebrokers.com)
2. Enable API access in Account Settings
3. Install IB Gateway or TWS
4. Generate API credentials in Account Management
5. Note: IBKR requires running their gateway software

### Coinbase
1. Sign up at [coinbase.com](https://coinbase.com)
2. Enable Advanced Trade
3. Go to Settings → API
4. Create API key with "Trade" permissions
5. Save key name and private key

### Binance
1. Create account at [binance.com](https://binance.com)
2. Complete KYC verification
3. Go to API Management
4. Create new key, enable spot trading
5. Save API Key and Secret Key
6. Optional: Restrict to specific IPs for security

### Kraken
1. Sign up at [kraken.com](https://kraken.com)
2. Complete verification
3. Settings → API
4. Generate API key with trading permissions
5. Save public and private keys

## Security Best Practices

### For Users
⚠️ **Start with Paper Trading** - Test strategies risk-free  
⚠️ **Protect Your Keys** - Never share or expose keys  
⚠️ **Monitor Regularly** - Check broker dashboard daily  
⚠️ **Set Position Limits** - Configure max position sizes  
⚠️ **Enable Circuit Breakers** - Auto-pause on drawdown  

### For Platform
🔒 **Fernet Encryption** - All secrets encrypted at rest  
🔒 **No Secret Logging** - Secrets never in logs/responses  
🔒 **Validation on Save** - Keys tested before storing  
🔒 **User Isolation** - Each user's keys completely separate  

## API Endpoints

```bash
# Get supported brokers
GET /api/broker/supported

# Connect broker
POST /api/broker/keys
{
  "exchange": "alpaca|ibkr|coinbase|binance|kraken",
  "label": "My Trading Account",
  "api_key": "...",
  "secret_key": "...",
  "paper_mode": true
}

# List connected brokers
GET /api/broker/keys

# Test connection
POST /api/broker/keys/{key_id}/test

# Remove broker
DELETE /api/broker/keys/{key_id}
```

## Technical Architecture

### Broker Adapter Pattern
Each broker has its own adapter implementing common interface:
- `get_account()` - Fetch account info
- `get_positions()` - Get current positions
- `place_order()` - Execute trade
- `get_latest_price()` - Fetch current price

### Bot Execution Flow
```
Bot tick → Fetch user's broker credentials
    ↓
Decrypt API keys from database
    ↓
Get broker adapter for user's exchange
    ↓
Execute strategy → Generate orders
    ↓
Place orders via user's broker adapter
    ↓
Orders executed in user's real broker account
```

### Database Schema
```javascript
// api_keys collection
{
  _id: ObjectId,
  user_id: "user@example.com",
  label: "My Alpaca Account",
  exchange: "alpaca",  // or ibkr, coinbase, binance, kraken
  key_id: "PK...",     // Public key
  secret_enc: Binary,  // Encrypted secret
  paper_mode: true,
  created_at: ISODate
}
```

## Broker-Specific Notes

### Alpaca
- Supports fractional shares
- Crypto uses `BTCUSD` format
- Paper and live have separate URLs
- Very reliable API, great for beginners

### Interactive Brokers
- Most complex integration
- Requires running gateway software
- Uses contract IDs instead of symbols
- Best execution, lowest fees
- Global market access

### Coinbase
- Simple REST API
- Uses `BTC-USD` pair format
- No paper trading available
- Higher fees than exchanges
- Good for US institutions

### Binance
- Largest crypto exchange
- Testnet available for paper trading
- HMAC signature required
- Very fast execution
- Many trading pairs

### Kraken
- Strong security reputation
- Base64 signature required
- No paper trading
- Good for Europe
- Lower volume than Binance

## Troubleshooting

### "Invalid API credentials"
- Verify you copied complete key and secret
- Check paper vs live mode matches your keys
- Ensure keys haven't been revoked
- For Binance/Kraken: Check signature method

### "No broker account connected"
- Go to Settings and connect broker first
- Test connection after connecting
- Ensure connection was successful

### "Insufficient buying power"
- Check your broker account balance
- Reduce position sizes in bot settings
- Fund your broker account

### Orders not appearing
- Check bot logs in Bots page
- Verify bot status is "running"
- Check broker's own dashboard/app
- Review bot_logs collection in database

### IBKR Connection Issues
- Ensure IB Gateway or TWS is running
- Check gateway is accepting connections
- Verify port configuration
- Client Portal API requires session management

## Deployment Checklist

✅ All broker adapter files created  
✅ Broker router updated with multi-broker support  
✅ Settings UI shows broker dropdown  
✅ Encryption/decryption working  
✅ Bot engine uses broker adapter factory  
✅ Database indexes for api_keys collection  
✅ User documentation for each broker  

## Future Enhancements

1. **Broker Portfolio View** - Aggregate positions across brokers
2. **Multi-Broker Arbitrage** - Bots that trade across exchanges
3. **Broker Health Monitoring** - Auto-check connection status
4. **Key Rotation** - Allow users to update keys seamlessly
5. **More Brokers** - TD Ameritrade, Robinhood, eToro, etc.

## Admin Queries

```javascript
// Check which brokers users are using
db.api_keys.aggregate([
  { $group: { _id: "$exchange", count: { $sum: 1 } } }
])

// Find users with multiple broker connections
db.api_keys.aggregate([
  { $group: { _id: "$user_id", brokers: { $push: "$exchange" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

// Check paper vs live distribution
db.api_keys.aggregate([
  { $group: { _id: "$paper_mode", count: { $sum: 1 } } }
])
```

## Support Resources

- **Alpaca**: [alpaca.markets/support](https://alpaca.markets/support)
- **IBKR**: [interactivebrokers.com/support](https://interactivebrokers.com/support)
- **Coinbase**: [help.coinbase.com](https://help.coinbase.com)
- **Binance**: [binance.com/support](https://binance.com/support)
- **Kraken**: [support.kraken.com](https://support.kraken.com)
