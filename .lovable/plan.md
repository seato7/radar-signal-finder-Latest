## Goal

Force a redeploy of the `chat-assistant` edge function from the current source on disk (which contains the diagnostic at line 129 of `supabase/functions/chat-assistant/index.ts`) and report back the deploy timestamp so you can trigger a fresh request afterwards.

## Confirmed before deploy

- Source on disk has the diagnostic correctly placed:
  - Line 124: `serve(async (req) => {`
  - Lines 125–127: `OPTIONS` preflight short-circuit
  - Lines 132–135: `console.log('chat-assistant env keys:', …)` — runs on every non-OPTIONS request before the `try` / auth block
- Latest production logs still only show `401: no authenticated user` and boot/listen lines — no `chat-assistant env keys:` entry. So the running deployment is older than this source.

## Steps

1. Call `supabase--deploy_edge_functions` with `function_names: ["chat-assistant"]` to force a fresh deploy from the current source.
2. Immediately after the deploy returns, fetch the most recent `chat-assistant` logs and read the latest `booted` / `Listening on http://localhost:9999/` line — that timestamp is the new deploy's first cold start.
3. Report that timestamp back to you (UTC, ISO format) as the "deployed at" marker.
4. Wait for you to trigger a new chat request from the logged-in browser session.
5. Re-fetch logs filtered by `env keys` and paste the raw entry, including the array of matching env var names. That will tell us which `SUPABASE_*` / `*_KEY` variables are actually present in the function runtime so the auth fix can use the correct one.

## Notes

- I cannot run the deploy or modify files in plan mode; approving this plan will let me execute step 1 onward.
- I will not edit `index.ts` during this flow — only deploy what is already on disk and read logs.
- If the deploy itself fails (e.g. lockfile / import error), I will surface the exact error instead of silently continuing.
