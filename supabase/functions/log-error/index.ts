// Phase 6B: requires auth, rate-limits per user, dedups Slack notifications.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PAYLOAD_BYTES = 10 * 1024;
const RATE_LIMIT_PER_MINUTE = 10;
const SLACK_DEDUP_WINDOW_MIN = 60;

interface ErrorLog {
  error: string;
  errorInfo?: any;
  location: string;
  userId?: string;
  userAgent?: string;
  url?: string;
  timestamp: string;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 1) AUTH — must be a real signed-in user
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const userId = claimsData.claims.sub as string;

  // 2) PARSE + size limit
  const rawBody = await req.text();
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: 'Payload too large (max 10KB)' }), {
      status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  let errorLog: ErrorLog;
  try {
    errorLog = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  if (!errorLog?.error || typeof errorLog.error !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing error field' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // 3) RATE LIMIT — 10/min/user
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await admin
    .from('log_error_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneMinAgo);

  if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 4) DEDUP Slack — hash on (location + error message), 60min window
  const errorHash = await sha256Hex(`${errorLog.location || 'unknown'}::${errorLog.error}`);
  const dedupSince = new Date(Date.now() - SLACK_DEDUP_WINDOW_MIN * 60_000).toISOString();
  const { count: notifiedRecently } = await admin
    .from('log_error_events')
    .select('id', { count: 'exact', head: true })
    .eq('error_hash', errorHash)
    .eq('slack_notified', true)
    .gte('created_at', dedupSince);

  const shouldNotifySlack = (notifiedRecently ?? 0) === 0;

  // 5) Persist event row first (covers rate limit + dedup state for subsequent calls)
  await admin.from('log_error_events').insert({
    user_id: userId,
    error_hash: errorHash,
    slack_notified: shouldNotifySlack,
  });

  // 6) Store the full error in alert_history
  await admin.from('alert_history').insert({
    function_name: 'frontend-error',
    alert_type: 'critical_error',
    severity: 'critical',
    message: errorLog.error,
    metadata: { ...errorLog, user_id: userId, error_hash: errorHash },
  });

  // 7) Slack — only on first occurrence per hour
  if (shouldNotifySlack) {
    const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackWebhook) {
      const severity = errorLog.location === 'ErrorBoundary' ? '🔴 CRITICAL' : '⚠️ ERROR';
      try {
        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${severity} Frontend Error`,
            attachments: [{
              color: errorLog.location === 'ErrorBoundary' ? 'danger' : 'warning',
              fields: [
                { title: 'Location', value: errorLog.location, short: true },
                { title: 'User', value: userId, short: true },
                { title: 'Error', value: errorLog.error.substring(0, 500), short: false },
                { title: 'URL', value: errorLog.url || 'N/A', short: false },
                { title: 'Time', value: errorLog.timestamp, short: true },
                { title: 'Hash', value: errorHash.substring(0, 12), short: true },
              ]
            }]
          })
        });
      } catch (e) {
        console.error('Slack notify failed:', e);
      }
    }
  }

  return new Response(JSON.stringify({ success: true, slack_notified: shouldNotifySlack }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
