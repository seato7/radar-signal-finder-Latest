import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v12 - Railway trigger-only. Edge no longer scrapes; calls Railway backend for options ingestion.

interface RailwayResponse {
  success: boolean;
  inserted: number;
  source?: string;
  reason?: string;
  details?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseKey);
  const slackAlerter = new SlackAlerter();

  // Parse request body
  let tickers: string[] = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
  let debug = false;

  try {
    const body = await req.json();
    if (body.tickers && Array.isArray(body.tickers)) {
      tickers = body.tickers;
    }
    if (body.debug === true) {
      debug = true;
    }
  } catch {
    // Use defaults if body parsing fails
  }

  // Resolve Railway base URL
  const railwayBaseUrl = Deno.env.get('RAILWAY_BASE_URL') || Deno.env.get('BACKEND_BASE_URL');
  
  if (!railwayBaseUrl) {
    const errorMsg = 'Missing RAILWAY_BASE_URL/BACKEND_BASE_URL environment variable';
    console.error(`[ERROR] ${errorMsg}`);

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'railway_trigger',
      error_message: errorMsg,
      metadata: {
        version: 'v12_railway_trigger',
        tickers_requested: tickers.length,
        debug_mode: debug,
      },
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-options-flow',
      message: errorMsg,
    });

    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Build request to Railway
  const railwayEndpoint = `${railwayBaseUrl.replace(/\/$/, '')}/api/options/ingest`;
  const backendJwt = Deno.env.get('BACKEND_JWT');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (backendJwt) {
    headers['Authorization'] = `Bearer ${backendJwt}`;
  }

  if (debug) {
    console.log(`[DEBUG] Calling Railway: ${railwayEndpoint}`);
    console.log(`[DEBUG] Tickers: ${tickers.join(', ')}`);
    console.log(`[DEBUG] Auth header present: ${!!backendJwt}`);
  }

  try {
    // Call Railway with 20s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let response: Response;
    try {
      response = await fetch(railwayEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tickers, debug }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseStatus = response.status;
    
    // Handle auth errors
    if (responseStatus === 401 || responseStatus === 403) {
      const errorMsg = `Railway auth failed (${responseStatus}): ${backendJwt ? 'Invalid BACKEND_JWT' : 'BACKEND_JWT not configured'}`;
      console.error(`[ERROR] ${errorMsg}`);

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'failure',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'railway_trigger',
        error_message: errorMsg,
        metadata: {
          version: 'v12_railway_trigger',
          railway_endpoint: railwayEndpoint,
          response_status: responseStatus,
          tickers_requested: tickers.length,
          debug_mode: debug,
        },
      });

      await slackAlerter.sendCriticalAlert({
        type: 'halted',
        etlName: 'ingest-options-flow',
        message: errorMsg,
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle non-200 responses
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const errorMsg = `Railway returned ${responseStatus}: ${errorText.slice(0, 200)}`;
      console.error(`[ERROR] ${errorMsg}`);

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'failure',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'railway_trigger',
        error_message: errorMsg,
        metadata: {
          version: 'v12_railway_trigger',
          railway_endpoint: railwayEndpoint,
          response_status: responseStatus,
          tickers_requested: tickers.length,
          debug_mode: debug,
        },
      });

      await slackAlerter.sendCriticalAlert({
        type: 'halted',
        etlName: 'ingest-options-flow',
        message: errorMsg,
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse Railway response
    let railwayData: RailwayResponse;
    try {
      railwayData = await response.json();
    } catch (e) {
      const errorMsg = 'Railway returned non-JSON response';
      console.error(`[ERROR] ${errorMsg}`);

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'failure',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'railway_trigger',
        error_message: errorMsg,
        metadata: {
          version: 'v12_railway_trigger',
          railway_endpoint: railwayEndpoint,
          debug_mode: debug,
        },
      });

      await slackAlerter.sendCriticalAlert({
        type: 'halted',
        etlName: 'ingest-options-flow',
        message: errorMsg,
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (debug) {
      console.log(`[DEBUG] Railway response: ${JSON.stringify(railwayData)}`);
    }

    // Handle Railway response
    if (!railwayData.success) {
      const errorMsg = railwayData.reason || 'Railway returned success=false';
      console.error(`[ERROR] ${errorMsg}`);

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'failure',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: railwayData.source || 'railway',
        error_message: errorMsg,
        metadata: {
          version: 'v12_railway_trigger',
          railway_endpoint: railwayEndpoint,
          railway_response: railwayData,
          tickers_requested: tickers.length,
          debug_mode: debug,
        },
      });

      await slackAlerter.sendCriticalAlert({
        type: 'halted',
        etlName: 'ingest-options-flow',
        message: errorMsg,
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMsg, details: railwayData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const inserted = railwayData.inserted || 0;
    const source = railwayData.source || 'railway';
    const reason = railwayData.reason;

    // No data case - with explicit error handling for observability
    if (inserted === 0) {
      const noDataReason = railwayData.reason || reason || 'no_data_from_provider';
      console.log(`[INFO] No options data inserted: ${noDataReason}`);
      console.log(`[INFO] Railway endpoint used: ${railwayEndpoint}`);
      console.log(`[INFO] Railway response: ${JSON.stringify(railwayData)}`);

      // Attempt Slack alert with explicit error handling
      let slackSuccess = false;
      try {
        await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
          sourcesAttempted: [source],
          reason: noDataReason,
        });
        slackSuccess = true;
        console.log('[INFO] Slack no-data alert sent successfully');
      } catch (slackErr) {
        const slackErrMsg = slackErr instanceof Error ? slackErr.message : String(slackErr);
        const slackStack = slackErr instanceof Error ? slackErr.stack : undefined;
        console.error(`[ERROR] Slack no-data alert failed: ${slackErrMsg}`);
        if (slackStack) {
          console.error(`[ERROR] Slack error stack: ${slackStack}`);
        }
      }

      // Attempt function_status insert with explicit error handling
      let fsInsertSuccess = false;
      try {
        const { error: fsError } = await supabase.from('function_status').insert({
          function_name: 'ingest-options-flow',
          executed_at: new Date().toISOString(),
          status: 'success',  // Using 'success' as status constraint only allows success/failure/skipped; no_data is tracked via metadata.outcome
          rows_inserted: 0,
          rows_skipped: 0,
          duration_ms: Date.now() - startTime,
          source_used: source,
          error_message: noDataReason,
          metadata: {
            version: 'v12_railway_trigger',
            outcome: 'no_data',  // Tracks the actual outcome since status='success' due to constraint
            railway_endpoint: railwayEndpoint,
            reason: noDataReason,
            tickers_requested: tickers.length,
            debug_mode: debug,
            railway_status: responseStatus,
            railway_response: {
              success: railwayData.success,
              inserted: railwayData.inserted,
              source: railwayData.source,
              reason: railwayData.reason,
            },
            slack_alert_sent: slackSuccess,
          },
        });

        if (fsError) {
          console.error(`[ERROR] function_status insert failed: ${JSON.stringify(fsError)}`);
        } else {
          fsInsertSuccess = true;
          console.log('[INFO] function_status row inserted successfully for no_data');
        }
      } catch (dbErr) {
        const dbErrMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        const dbStack = dbErr instanceof Error ? dbErr.stack : undefined;
        console.error(`[ERROR] function_status insert exception: ${dbErrMsg}`);
        if (dbStack) {
          console.error(`[ERROR] DB error stack: ${dbStack}`);
        }
      }

      // Log final observability status before returning
      console.log(`[INFO] Observability status - Slack: ${slackSuccess ? 'OK' : 'FAILED'}, function_status: ${fsInsertSuccess ? 'OK' : 'FAILED'}`);

      return new Response(
        JSON.stringify({
          success: true,
          count: 0,
          source,
          version: 'v12_railway_trigger',
          reason: noDataReason,
          details: railwayData.details,
          observability: {
            slack_alert: slackSuccess,
            function_status_insert: fsInsertSuccess,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success case
    console.log(`✅ Options ingestion successful: ${inserted} records via ${source}`);

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: 0,
      sourceUsed: source,
      duration: Date.now() - startTime,
    });

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      duration_ms: Date.now() - startTime,
      source_used: source,
      metadata: {
        version: 'v12_railway_trigger',
        railway_endpoint: railwayEndpoint,
        railway_response: railwayData,
        tickers_processed: tickers.length,
        debug_mode: debug,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        count: inserted,
        source,
        version: 'v12_railway_trigger',
        details: railwayData.details,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const errorMsg = isTimeout
      ? 'Railway request timed out (20s)'
      : `Railway call failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    
    console.error(`[ERROR] ${errorMsg}`);

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'railway_trigger',
      error_message: errorMsg,
      metadata: {
        version: 'v12_railway_trigger',
        railway_endpoint: railwayBaseUrl ? `${railwayBaseUrl}/api/options/ingest` : 'unknown',
        tickers_requested: tickers.length,
        debug_mode: debug,
        is_timeout: isTimeout,
      },
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-options-flow',
      message: errorMsg,
    });

    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
