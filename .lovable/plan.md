## Confirmed state

- Commit ad600e2 IS deployed to chat-assistant (cold boot at 2026-04-29T00:51:50Z, source line 145 matches).
- Logs show `hadAuthHeader: true`, no thrown auth error, but `getUser()` returns `null` → falls through to 401.
- Project uses new asymmetric signing keys (`SUPABASE_JWKS` + `SUPABASE_PUBLISHABLE_KEYS` in env). `auth.getUser()` against the legacy anon key path silently returns null for JWTs signed with the new keys.

## Root cause

`getUser()` is the wrong API in the new signing-keys world. The Lovable/Supabase guidance is to validate JWTs in code using `supabase.auth.getClaims(token)`, which verifies against JWKS locally and returns the user's claims (`sub`, `email`, `role`, `exp`).

## Fix (single file: `supabase/functions/chat-assistant/index.ts`)

Replace the auth block (lines ~140–170) so it:

1. Reads `Authorization` header, extracts the bearer token.
2. Calls `supabase.auth.getClaims(token)` on the existing service-role client (no need to spin up a second client just for auth).
3. On success: `authenticatedUserId = data.claims.sub`, then look up `user_roles` as today.
4. On failure: log a structured warning including `claimsError?.message` so we can see exactly why if it ever fails again, and fall through to the existing 401.

Pseudocode:

```text
const authHeader = req.headers.get('Authorization');
if (authHeader?.startsWith('Bearer ')) {
  const token = authHeader.slice(7);
  const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    console.warn('chat-assistant getClaims failed', {
      message: claimsError?.message,
      hasJwks: !!Deno.env.get('SUPABASE_JWKS'),
    });
  } else {
    authenticatedUserId = claimsData.claims.sub;
    // existing user_roles lookup unchanged
  }
}
```

Keep the existing 401 response block downstream untouched — it will now only trigger for genuinely unauthenticated requests.

## Verification

1. Deploy chat-assistant.
2. Capture the new boot timestamp.
3. User triggers one chat from insiderpulse.org while logged in.
4. Pull last 60s of logs and confirm:
   - No `chat-assistant getClaims failed` warning.
   - No `chat-assistant 401: no authenticated user` for that request.
   - The chat response returns 200 with content.
5. If it still fails, the new structured warning will tell us exactly which JWKS/claims path is breaking — no more silent nulls.

## Out of scope

- No frontend changes (`AIAssistantChat.tsx` correctly uses `supabase.functions.invoke` which forwards the user's session token).
- No secret changes (all required keys already present).
- No changes to other edge functions in this pass.
