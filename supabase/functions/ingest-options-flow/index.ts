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

    // No data case
    if (inserted === 0) {
      const noDataReason = reason || 'no_data_from_provider';
      console.log(`[INFO] No options data inserted: ${noDataReason}`);

      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: [source],
        reason: noDataReason,
      });

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'no_data',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: source,
        error_message: noDataReason,
        metadata: {
          version: 'v12_railway_trigger',
          railway_endpoint: railwayEndpoint,
          railway_response: railwayData,
          tickers_requested: tickers.length,
          debug_mode: debug,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          count: 0,
          source,
          version: 'v12_railway_trigger',
          reason: noDataReason,
          details: railwayData.details,
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
