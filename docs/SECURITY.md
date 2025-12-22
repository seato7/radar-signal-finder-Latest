# Security Documentation

## Overview

Opportunity Radar implements multiple layers of security across the hybrid architecture.

---

## Authentication

### User Authentication (Supabase Auth)
- Email/password authentication
- Auto-confirm enabled for development
- JWT tokens with 7-day expiry
- Session management via Supabase client

### API Authentication
- **Edge Functions**: Supabase JWT or API key
- **Railway Backend**: Custom JWT with `JWT_SECRET_KEY`
- **Public Functions**: `verify_jwt = false` in config.toml

---

## Row Level Security (RLS)

All user data tables have RLS enabled:

```sql
-- Users can only view their own data
CREATE POLICY "Users view own data"
ON watchlist FOR SELECT
USING (auth.uid() = user_id);

-- Users can only insert their own data
CREATE POLICY "Users insert own data"
ON watchlist FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY "Users update own data"
ON watchlist FOR UPDATE
USING (auth.uid() = user_id);

-- Users can only delete their own data
CREATE POLICY "Users delete own data"
ON watchlist FOR DELETE
USING (auth.uid() = user_id);
```

### Tables with RLS
- `watchlist` - User watchlists
- `alerts` - User alerts
- `bots` - Trading bots
- `bot_orders` - Bot orders
- `bot_positions` - Bot positions
- `broker_keys` - Broker API credentials
- `user_roles` - User subscription tiers
- `user_theme_subscriptions` - Theme subscriptions

---

## Secrets Management

### Supabase Secrets (Edge Functions)
| Secret | Purpose | Sensitivity |
|--------|---------|-------------|
| `LOVABLE_API_KEY` | AI features | High |
| `FIRECRAWL_API_KEY` | Web scraping | High |
| `TWELVEDATA_API_KEY` | Price data | High |
| `STRIPE_SECRET_KEY` | Payments | Critical |
| `BROKER_ENCRYPTION_KEY` | Broker credentials | Critical |
| `SLACK_WEBHOOK_URL` | Alerts | Medium |

### Railway Environment Variables
| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `JWT_SECRET_KEY` | JWT signing | Critical |
| `MONGO_URL` | Database connection | High |
| `SUPABASE_SERVICE_KEY` | Database write access | Critical |
| `TWELVEDATA_API_KEY` | Price data | High |
| `BROKER_ENCRYPTION_KEY` | Broker credentials | Critical |

---

## Broker Key Encryption

Broker API keys are encrypted at rest using Fernet symmetric encryption:

```python
# backend/utils/encryption.py
from cryptography.fernet import Fernet

def encrypt_broker_key(plain_text: str) -> str:
    key = settings.BROKER_ENCRYPTION_KEY.encode()
    f = Fernet(key)
    return f.encrypt(plain_text.encode()).decode()

def decrypt_broker_key(encrypted: str) -> str:
    key = settings.BROKER_ENCRYPTION_KEY.encode()
    f = Fernet(key)
    return f.decrypt(encrypted.encode()).decode()
```

### Key Rotation
Users can rotate their broker keys via the UI:
1. Go to Settings → Broker Connections
2. Click "Rotate Keys"
3. Enter new API credentials
4. Old keys are invalidated

Rotation is logged in `broker_key_rotation_logs` table.

---

## Rate Limiting

### Backend API
```python
# backend/utils/rate_limiter.py
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)

@app.get("/api/radar")
@limiter.limit("60/minute")
async def get_radar():
    ...
```

### Edge Functions
- Supabase applies default rate limits
- Custom limits via request counting in Redis

### External APIs
- TwelveData: 55 credits/min (managed by scheduler)
- Firecrawl: Connector-managed limits
- Reddit: 60 requests/min

---

## CORS Configuration

### Edge Functions
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Handle preflight
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}
```

### Railway Backend
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Input Validation

### Backend (Pydantic)
```python
from pydantic import BaseModel, validator

class AlertCreate(BaseModel):
    ticker: str
    threshold: float

    @validator('ticker')
    def ticker_must_be_valid(cls, v):
        if not v or len(v) > 10:
            raise ValueError('Invalid ticker')
        return v.upper()
```

### Edge Functions (Zod)
```typescript
import { z } from 'zod';

const requestSchema = z.object({
  ticker: z.string().min(1).max(10),
  threshold: z.number().positive(),
});

const { ticker, threshold } = requestSchema.parse(await req.json());
```

---

## Security Best Practices

### ✅ Implemented
- [x] RLS on all user data tables
- [x] Encrypted broker credentials
- [x] JWT authentication
- [x] Input validation
- [x] Rate limiting
- [x] CORS headers
- [x] Secrets management

### ⚠️ Recommendations
- [ ] Enable MFA for admin users
- [ ] Implement IP allowlisting for backend
- [ ] Add request logging/auditing
- [ ] Set up security monitoring alerts
- [ ] Regular security audits

---

## Incident Response

### If API Keys Compromised
1. Rotate affected keys immediately
2. Check access logs for unauthorized usage
3. Update secrets in Railway/Supabase
4. Monitor for unusual activity

### If Database Breached
1. Enable Supabase point-in-time recovery
2. Review RLS policies
3. Audit user access patterns
4. Reset all user sessions

### Contact
For security issues, contact the development team immediately.
