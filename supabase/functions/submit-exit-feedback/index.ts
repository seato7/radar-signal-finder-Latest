import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { sendErrorAlert } from "../_shared/error-alerter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ORIGINS = [
  'https://insiderpulse.org',
  'https://www.insiderpulse.org',
  'http://localhost:3000',
  'http://localhost:5173',
];

function safeOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : 'https://insiderpulse.org';
}

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SUBMIT-EXIT-FEEDBACK] ${step}${detailsStr}`);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  void safeOrigin;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const deletionId = typeof body.deletion_id === 'string' ? body.deletion_id : '';
    let feedbackText = typeof body.feedback_text === 'string' ? body.feedback_text : '';

    if (!deletionId || !UUID_RE.test(deletionId)) {
      return new Response(JSON.stringify({ error: 'Invalid deletion_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    feedbackText = feedbackText.trim();
    if (!feedbackText) {
      return new Response(JSON.stringify({ error: 'feedback_text is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (feedbackText.length > 2000) feedbackText = feedbackText.slice(0, 2000);

    // Verify the deletion_id exists and hasn't already had feedback submitted.
    const { data: logRow, error: logError } = await supabaseAdmin
      .from('account_deletion_log')
      .select('id, feedback_submitted')
      .eq('id', deletionId)
      .maybeSingle();

    if (logError) throw new Error(logError.message);
    if (!logRow) {
      logStep('Not found', { deletion_id: deletionId });
      return new Response(JSON.stringify({ error: 'Deletion record not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (logRow.feedback_submitted) {
      return new Response(
        JSON.stringify({ error: 'Feedback already submitted for this deletion' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Insert feedback + mark as submitted.
    const { error: insertError } = await supabaseAdmin
      .from('exit_feedback')
      .insert({ deletion_id: deletionId, feedback_text: feedbackText });
    if (insertError) throw new Error(`exit_feedback insert: ${insertError.message}`);

    const { error: updateError } = await supabaseAdmin
      .from('account_deletion_log')
      .update({ feedback_submitted: true })
      .eq('id', deletionId);
    if (updateError) {
      // Feedback is recorded; flag mismatch but still 200 so the UI confirms.
      logStep('Flag update failed (non-fatal)', { error: updateError.message });
    }

    const duration = Date.now() - startTime;
    logStep('Feedback recorded', { deletion_id: deletionId, chars: feedbackText.length });

    try {
      await logHeartbeat(supabaseAdmin, {
        function_name: 'submit-exit-feedback',
        status: 'success',
        duration_ms: duration,
        source_used: 'exit_feedback',
      });
    } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = (error as Error).message;
    logStep('ERROR', { message: errorMessage });
    const duration = Date.now() - startTime;
    try {
      await logHeartbeat(supabaseAdmin, {
        function_name: 'submit-exit-feedback',
        status: 'failure',
        duration_ms: duration,
        error_message: errorMessage,
      });
    } catch (_) { /* ignore */ }
    try { await sendErrorAlert('submit-exit-feedback', error, { url: req.url }); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
