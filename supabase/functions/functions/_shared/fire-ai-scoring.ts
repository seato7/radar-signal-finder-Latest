/**
 * Fire-and-forget helper: triggers compute-ai-scores for specific tickers
 * after a generate-signals function inserts new signals.
 * Uses fetch without await so it never blocks the caller's response.
 */
export function fireAiScoring(tickers: string[]): void {
  if (!tickers.length) return;
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-ai-scores`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tickers }),
  }).catch((err) => console.warn('[fire-ai-scoring] compute-ai-scores trigger failed:', err));
}
