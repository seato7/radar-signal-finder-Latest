# Payment Integration Guide

## Overview

Opportunity Radar uses Stripe for subscription management. Plans range from Free to Enterprise, with feature gating enforced server-side.

## Plans

| Plan | Price (AUD) | Bots | Alerts | Live Trading | Exports | Backtest Horizon |
|------|-------------|------|--------|--------------|---------|------------------|
| Free | $0 | 1 paper | 1 | No | CSV | 30 days |
| **Lite** | **$9.99/mo** | **3 paper** | **10** | **No** | **CSV** | **90 days** |
| Starter | $29/mo | 3 live-eligible | Unlimited | Yes* | CSV, Parquet | Unlimited |
| Pro | $79/mo | Unlimited | Unlimited | Yes* | CSV, Parquet | Unlimited |
| Enterprise | Contact | Unlimited | Unlimited | Yes* | All | Unlimited |

\* Live trading requires `LIVE_TRADING=1` environment variable

## Environment Variables

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs (from Stripe Dashboard)
STRIPE_LITE_PRICE_ID=price_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
```

## Feature Gating

Server-side middleware checks plan limits before allowing actions:

```python
from backend.services.payments import check_plan_limit

# Example: Check if user can create another bot
user_plan = "lite"
current_bots = 2
can_create = check_plan_limit(user_plan, "max_bots", current_bots)
```

**Gated Features:**
- `max_bots`: Number of bots user can create
- `max_alerts`: Number of alert rules
- `exports`: Allowed export formats
- `backtest_days`: Maximum backtest horizon (-1 = unlimited)
- `live_eligible`: Can switch bots to live mode

## Checkout Flow

1. User clicks "Start Lite" on `/pricing` page
2. Frontend calls `POST /api/payments/checkout` with plan ID
3. Backend creates Stripe Checkout Session
4. User redirected to Stripe hosted page
5. On success, Stripe fires `checkout.session.completed` webhook
6. Backend updates `subscriptions` collection

## Webhook Events

Supported Stripe webhooks:

- `checkout.session.completed`: New subscription created
- `customer.subscription.updated`: Plan changed or renewed
- `customer.subscription.deleted`: Subscription canceled
- `invoice.payment_failed`: Payment issue

All webhooks verify signature using `STRIPE_WEBHOOK_SECRET`.

## Customer Portal

Users manage subscriptions via Stripe Customer Portal:

```typescript
const response = await fetch('/api/payments/portal?user_id=default');
const { url } = await response.json();
window.location.href = url;
```

Portal allows:
- Upgrade/downgrade plan
- Update payment method
- Cancel subscription
- View invoices

## Testing

Use Stripe test mode:

1. Set `STRIPE_SECRET_KEY` to test key (`sk_test_...`)
2. Create test products/prices in Stripe Dashboard
3. Use test card: `4242 4242 4242 4242`
4. Trigger webhooks via Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:8000/api/payments/webhook
   ```

## Upgrade/Downgrade Logic

- **Upgrade**: Immediate access to new features, prorated billing
- **Downgrade**: Takes effect at end of current billing period
- **Cancel**: Access until current period ends, then reverts to Free

## Security

- API keys stored in environment variables, never committed
- Webhook signatures verified on every event
- User plan checked on every gated API request
- No client-side plan overrides

## Troubleshooting

**Webhook not firing:**
- Check Stripe Dashboard > Webhooks > Attempts
- Verify `STRIPE_WEBHOOK_SECRET` matches
- Ensure endpoint is publicly accessible (use ngrok for local dev)

**Plan limits not enforced:**
- Check `subscriptions` collection has correct plan
- Verify middleware is applied to gated routes
- Look for errors in `backend/services/payments.py` logs

**Checkout fails:**
- Ensure price IDs are correct for your Stripe account
- Verify `success_url` and `cancel_url` are valid
- Check Stripe API version compatibility

## Future Enhancements

- Annual billing (discount)
- Usage-based pricing (API calls, data volume)
- Team management (invite users, assign roles)
- Metered billing for live trading (per trade fee)
