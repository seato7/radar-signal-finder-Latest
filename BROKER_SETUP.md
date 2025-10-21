# Multi-Tenant Broker Integration Guide

## Overview

Opportunity Radar now supports **Model 1: User API Keys** - a secure, scalable approach where each user connects their own broker account. Users maintain full control of their funds while the platform executes trades on their behalf using encrypted API keys.

## Why Model 1?

✅ **No Regulatory Burden** - Platform never touches user money, no licenses needed  
✅ **Zero Liability** - Funds stay in user's broker account  
✅ **User Trust** - Users maintain full control and visibility  
✅ **Scalability** - No limit on number of users or capital  
✅ **Industry Standard** - Used by 90% of trading bot platforms  

## Supported Brokers

Currently supported:
- **Alpaca Markets** (Stocks & Crypto)
  - Paper trading (testing)
  - Live trading (real money)

## User Flow

### 1. Sign Up & Subscribe
Users create an account and choose a subscription plan.

### 2. Connect Broker Account
Users navigate to **Settings → Connect Broker Account** and:
- Enter their Alpaca API Key
- Enter their Alpaca Secret Key
- Choose Paper or Live mode
- Click "Connect Broker"

The system validates credentials before saving.

### 3. Create Trading Bot
Once broker is connected, users can:
- Create trading bots with strategies
- Start paper trading (always safe)
- Upgrade to live trading (requires paid plan + broker connection)

### 4. Trading Execution
- Platform fetches user's API keys (encrypted)
- Executes trades through user's broker account
- All orders appear in user's Alpaca dashboard
- Funds never leave user's broker account

## API Endpoints

### Connect Broker
```
POST /api/broker/keys
{
  "exchange": "alpaca",
  "label": "My Trading Account",
  "api_key": "PK...",
  "secret_key": "...",
  "paper_mode": true
}
```

### List Connected Brokers
```
GET /api/broker/keys
```

### Test Connection
```
POST /api/broker/keys/{key_id}/test
```

### Remove Broker
```
DELETE /api/broker/keys/{key_id}
```

## Security

### Encryption
- API secrets are encrypted using Fernet (symmetric encryption)
- Encryption key derived from JWT secret
- Secrets never returned in API responses
- Only decrypted when placing orders

### Validation
- API keys tested before saving
- Invalid credentials rejected immediately
- Connection tested periodically

### Storage
- MongoDB collection: `api_keys`
- Fields: `user_id`, `exchange`, `key_id`, `secret_enc`, `paper_mode`
- Indexes: unique per user/exchange/key combo

## User Guide

### How to Get Alpaca API Keys

1. **Create Alpaca Account**
   - Sign up at [alpaca.markets](https://alpaca.markets)
   - Complete verification

2. **Generate API Keys**
   - Go to Dashboard → API Keys
   - Click "Generate New Key"
   - Choose "Trading" permissions
   - Save both API Key and Secret Key (shown once!)

3. **Paper vs Live**
   - **Paper Trading**: Free, unlimited, no real money, perfect for testing
   - **Live Trading**: Real money, requires funded account, use with caution

4. **Connect to Opportunity Radar**
   - Navigate to Settings
   - Paste your API Key
   - Paste your Secret Key
   - Select Paper or Live mode
   - Click Connect

### Safety Tips

⚠️ **Start with Paper Trading**  
Always test strategies in paper mode first

⚠️ **Protect Your Keys**  
Never share API keys or secret keys

⚠️ **Monitor Your Account**  
Check your Alpaca dashboard regularly

⚠️ **Set Position Limits**  
Configure max position sizes in bot settings

⚠️ **Enable Circuit Breakers**  
Set max drawdown limits to auto-pause bots

## Technical Architecture

### Bot Execution Flow

```
User creates bot → Bot engine needs to trade
    ↓
Fetch user's encrypted API key from DB
    ↓
Decrypt secret key
    ↓
Initialize broker adapter with user's keys
    ↓
Execute trade through user's broker account
    ↓
Log order in database
```

### Key Components

1. **`backend/utils/encryption.py`** - Encryption/decryption utilities
2. **`backend/routers/broker.py`** - API key management endpoints
3. **`backend/services/alpaca_broker.py`** - Broker adapter (modified to accept keys)
4. **`backend/services/bot_engine.py`** - Bot execution (modified to fetch user keys)
5. **`src/pages/Settings.tsx`** - Frontend settings page

### Database Schema

```javascript
// api_keys collection
{
  _id: ObjectId,
  user_id: "user@example.com",
  label: "My Trading Account",
  exchange: "alpaca",
  key_id: "PK...",  // Public key
  secret_enc: Binary,  // Encrypted secret
  paper_mode: true,
  created_at: ISODate
}
```

## Future Brokers

The architecture is designed to support multiple brokers:
- Interactive Brokers
- TD Ameritrade
- Coinbase
- Binance
- Kraken

Each would require:
1. New adapter in `backend/services/{broker}_broker.py`
2. Update `backend/routers/broker.py` to validate that broker
3. Update `AlpacaAdapter` initialization to be broker-agnostic

## Troubleshooting

### "Invalid API credentials"
- Double-check you copied the full API key and secret
- Ensure keys are for the correct environment (paper vs live)
- Verify keys haven't been revoked in Alpaca dashboard

### "No broker account connected"
- Go to Settings and connect a broker first
- Ensure connection was successful (test it)

### "Insufficient buying power"
- Check your Alpaca account balance
- Reduce position sizes in bot settings
- Fund your Alpaca account

### Orders not appearing
- Check bot logs in the Bots page
- Verify bot status is "running"
- Check your Alpaca dashboard for orders
- Review bot_logs collection in database

## Admin Tasks

### Check User's Broker Connection
```javascript
db.api_keys.find({ user_id: "user@example.com" })
```

### Remove Stuck Keys
```javascript
db.api_keys.deleteOne({ _id: ObjectId("...") })
```

### Audit All Connections
```javascript
db.api_keys.aggregate([
  { $group: { _id: "$exchange", count: { $sum: 1 } } }
])
```

## Deployment Checklist

✅ Environment variable `JWT_SECRET_KEY` set (for encryption)  
✅ MongoDB indexes created (automatically on startup)  
✅ Frontend Settings page deployed  
✅ Backend broker router registered  
✅ User documentation updated  
✅ Support team trained  

## Next Steps

1. **User Onboarding** - Add broker connection to signup flow
2. **Broker Health Checks** - Periodic validation of stored keys
3. **Key Rotation** - Allow users to update keys without losing bot history
4. **Multi-Broker Support** - Add more broker integrations
5. **Portfolio View** - Show combined positions across all user's bots
