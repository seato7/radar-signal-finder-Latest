export async function sendErrorAlert(
  functionName: string,
  error: any,
  context?: Record<string, any>
) {
  const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
  if (!slackWebhook) return;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('rate limit');
  const isPaymentError = errorMessage.includes('402') || errorMessage.includes('credits');
  
  const severity = isRateLimitError || isPaymentError ? '⚠️ WARNING' : '🔴 CRITICAL';
  const color = isRateLimitError || isPaymentError ? 'warning' : 'danger';

  try {
    await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${severity} Edge Function Error: ${functionName}`,
        attachments: [{
          color,
          fields: [
            { title: 'Function', value: functionName, short: true },
            { title: 'Error Type', value: isRateLimitError ? 'Rate Limit' : isPaymentError ? 'Payment Required' : 'Runtime Error', short: true },
            { title: 'Message', value: errorMessage.substring(0, 500), short: false },
            ...(context ? [{ title: 'Context', value: JSON.stringify(context, null, 2).substring(0, 500), short: false }] : []),
            { title: 'Time', value: new Date().toISOString(), short: true }
          ]
        }]
      })
    });
  } catch (e) {
    console.error('Failed to send Slack alert:', e);
  }
}
