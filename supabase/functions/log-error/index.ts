import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ErrorLog {
  error: string;
  errorInfo?: any;
  location: string;
  userId?: string;
  userAgent?: string;
  url?: string;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    if (rawBody.length > 10240) { // 10KB limit
      return new Response(JSON.stringify({ error: 'Payload too large (max 10KB)' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const errorLog: ErrorLog = JSON.parse(rawBody);
    
    // Log to database
    await supabase.from('alert_history').insert({
      function_name: 'frontend-error',
      alert_type: 'critical_error',
      severity: 'critical',
      message: errorLog.error,
      metadata: errorLog
    });

    // Send Slack alert
    const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackWebhook) {
      const severity = errorLog.location === 'ErrorBoundary' ? '🔴 CRITICAL' : '⚠️ ERROR';
      
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${severity} Frontend Error`,
          attachments: [{
            color: errorLog.location === 'ErrorBoundary' ? 'danger' : 'warning',
            fields: [
              { title: 'Location', value: errorLog.location, short: true },
              { title: 'User', value: errorLog.userId || 'Anonymous', short: true },
              { title: 'Error', value: errorLog.error.substring(0, 500), short: false },
              { title: 'URL', value: errorLog.url || 'N/A', short: false },
              { title: 'Time', value: errorLog.timestamp, short: true }
            ]
          }]
        })
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error logging error:', error);
    return new Response(JSON.stringify({ error: 'Failed to log error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
