
Current findings

- I inspected `supabase/functions/manage-payments/index.ts` and `src/pages/Pricing.tsx`.
- The source code already includes the detailed logging you asked for:
  - `STARTUP` with `stripe_key_present` and `stripe_webhook_secret_present`
  - `REQUEST` with method/path
  - `Checkout request` with plan/period/user details
  - `CHECKOUT ERROR` with message/code/type
- The frontend already sends:
  - `plan`
  - `period`
  - `success_url`
  - `cancel_url`
  - `Authorization: Bearer <session access token>`
- I checked the live function logs and analytics logs for `manage-payments` and found no recent log entries at all.
- I also checked the preview snapshot’s console and network logs and found no `manage-payments` request in the current snapshot.

What this means

- I cannot truthfully report an exact current live checkout error from logs yet, because no recent `manage-payments` invocation log is available in the captured data.
- The missing `STRIPE_WEBHOOK_SECRET` is not the likely blocker for `/checkout`: that secret is only used in the `/webhook` branch, not in the checkout path.
- The most likely remaining causes are:
  1. The deployed `manage-payments` function is not the same version as the source I inspected, or
  2. The checkout request is reaching the function but failing with a Stripe API error after deployment drift, or
  3. The browser click is still not sending the authenticated request in the environment the user is testing.

Implementation plan

1. Reproduce and capture a fresh failure
   - Trigger the pricing checkout flow from the app while authenticated.
   - Immediately inspect:
     - live `manage-payments` logs
     - the exact network request/response
   - Goal: get the real `CHECKOUT ERROR` payload instead of guessing.

2. Confirm deployment/runtime drift
   - If the fresh click still produces no `manage-payments` logs, treat that as deployment mismatch or request-routing mismatch.
   - Redeploy only the relevant function(s), not the whole backend:
     - `manage-payments`
     - optionally the frontend if the runtime still lacks the auth-header checkout change
   - This avoids unrelated edge-function build issues from blocking a focused payments fix.

3. Fix based on the actual error
   - If Stripe mode mismatch:
     - verify the runtime key mode matches the live price IDs
     - keep `STRIPE_SECRET_KEY` on live mode for the current live prices
   - If Stripe returns a price/resource error:
     - correct the price mapping or failing checkout parameter
   - If auth is the issue:
     - verify the request reaches the function with the bearer token
     - keep the current `Pricing.tsx` auth-header behavior
   - If some other Stripe API call fails:
     - patch only the failing checkout-session logic and preserve current URLs/plan-period contract

4. Keep webhook handling separate
   - Do not treat missing `STRIPE_WEBHOOK_SECRET` as the cause of checkout failure.
   - If needed, set it afterwards so subscription sync works, but do not block checkout repair on it.

5. Verify end to end
   - Test direct authenticated POST to `/manage-payments/checkout` with:
     ```text
     { "plan": "starter", "period": "monthly" }
     ```
   - Then test the real pricing buttons in the UI for all paid plans.
   - Confirm each returns a 2xx response and redirects to a Stripe checkout URL.
   - Confirm logs now show:
     - `STARTUP`
     - `REQUEST`
     - `Checkout request`
     - either successful session creation or a fully detailed `CHECKOUT ERROR`

Technical details

- Relevant file already aligned with your intended logging:
  - `supabase/functions/manage-payments/index.ts`
- Relevant frontend call already aligned with authenticated checkout:
  - `src/pages/Pricing.tsx`
- Important code-level observation:
  - `/checkout` does not depend on `STRIPE_WEBHOOK_SECRET`
  - `/webhook` does
- Important operational observation:
  - because there are no recent live logs for `manage-payments`, the next correct step is to generate one fresh authenticated invocation and diagnose from that exact runtime output, rather than guessing from stale assumptions.

Expected outcome after implementation

- We will be able to state the exact live error message from logs.
- If it is a Stripe-mode mismatch, the fix is straightforward and isolated.
- If it is another Stripe API failure, the code path is already narrow and easy to correct.
- Final verification will be a real redirect from the pricing buttons to a Stripe-hosted checkout page.
