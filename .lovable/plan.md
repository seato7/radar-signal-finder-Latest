
Current findings

- `src/pages/Pricing.tsx` still has the old catch block:
  - it logs `err`
  - then shows `err.message || "Something went wrong. Please try again."`
  - it does not attempt `await err.context?.json()`, so a 400 response body from the backend is currently hidden from the toast.
- The live `manage-payments` runtime logs I checked right now show only:
  - `STARTUP - {"stripe_key_present":true,"stripe_webhook_secret_present":false}`
- I do not see any fresh `REQUEST`, `Checkout request`, or `CHECKOUT ERROR` lines after the click you mentioned.
- Analytics also show no recent HTTP invocation records for `manage-payments`.

What the logs mean right now

- Exact currently visible live log output:
  - `STARTUP - {"stripe_key_present":true,"stripe_webhook_secret_present":false}`
- Exact currently missing log output:
  - no `REQUEST`
  - no `Checkout request`
  - no `CHECKOUT ERROR`
  - no Stripe error payload
- That means I cannot truthfully report a backend error body from logs yet, because the latest reported click did not produce any captured live checkout log entries.

Implementation plan

1. Update `src/pages/Pricing.tsx`
   - Replace the current `catch (err: any)` block in `handleCheckout` with the version you provided.
   - Keep the rest of the checkout flow unchanged.
   - Result: when the backend returns a JSON body like `{ error: "..." }`, the toast will show that actual message.

2. Verify frontend behavior after the change
   - Re-test the pricing button.
   - Confirm the console logs:
     - `[Pricing] Checkout error: ...`
     - `[Pricing] Edge function error body: ...`
   - Confirm the toast shows the backend `error` string instead of the generic fallback.

3. Publish the frontend
   - Push the updated client code live via frontend publish/update so the new toast behavior is active outside preview.

4. Re-check live backend logs immediately after a fresh click
   - Inspect `manage-payments` logs again for:
     - `STARTUP`
     - `REQUEST`
     - `Checkout request`
     - `CHECKOUT ERROR`
   - If the request now reaches the function, capture the exact Stripe/backend error and fix that next.

Expected outcome

- The frontend will surface the real backend error body.
- We’ll know whether the failure is:
  - a backend validation/Stripe error returned by `manage-payments`, or
  - a client-side/request-routing issue where the request never reaches the backend.
- Right now, based on the logs, the second case is still possible because no fresh checkout invocation is visible.

Technical details

- File to change:
  - `src/pages/Pricing.tsx`
- Exact frontend issue:
  - current code throws/handles only `err.message`
  - function response bodies from `FunctionsHttpError` are not parsed
- Exact live backend status at time of inspection:
  - `STRIPE_SECRET_KEY` present: `true`
  - `STRIPE_WEBHOOK_SECRET` present: `false`
- Important note:
  - the missing webhook secret does not explain the absence of `REQUEST` / `CHECKOUT ERROR` logs for `/checkout`
  - first priority is surfacing the response body in the client and generating one fresh logged invocation
