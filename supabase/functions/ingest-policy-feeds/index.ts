import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { withRetry } from "../_shared/retry-wrapper.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const logId = crypto.randomUUID();
  const slackAlerter = new SlackAlerter();

  // Start logging
  await supabaseClient.from('ingest_logs').insert({
    id: logId,
    etl_name: 'ingest-policy-feeds',
    status: 'running',
    started_at: new Date().toISOString(),
    source_used: 'RSS Feeds',
    cache_hit: false,
    fallback_count: 0,
    latency_ms: 0,
  });

  await slackAlerter.sendLiveAlert({
    etlName: 'ingest-policy-feeds',
    status: 'started',
    metadata: { source: 'RSS Feeds' }
  });

  try {
    // Parse request body with defaults
    let feed_urls: string[] = [];
    let keywords: string[] = [];
    
    try {
      const body = await req.json();
      feed_urls = body.feed_urls || [];
      keywords = body.keywords || [];
    } catch {
      // Body is empty or invalid - use defaults
    }
    
    // Default feed URLs and keywords if not provided
    if (feed_urls.length === 0) {
      feed_urls = [
        'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=energy-department',
        'https://www.ferc.gov/rss/news.xml'
      ];
    }
    
    if (keywords.length === 0) {
      keywords = [
        'transmission', 'grid', 'power', 'electricity', 'transformer',
        'hvdc', 'renewable', 'solar', 'wind', 'battery', 'storage',
        'interconnection', 'substation', 'utility', 'infrastructure'
      ];
    }
    
    console.log(`Processing ${feed_urls.length} feeds with ${keywords.length} keywords`);
    
    let inserted = 0;
    let skipped = 0;
    let sourceUsed = 'RSS Feeds';
    
    // Add 8-minute timeout guard
    const TIMEOUT_MS = 480000; // 8 minutes
    const timeoutAt = Date.now() + TIMEOUT_MS;
    
    for (const feedUrl of feed_urls) {
      // Check timeout guard
      if (Date.now() >= timeoutAt) {
        console.error(`⏱️ TIMEOUT: Exceeded ${TIMEOUT_MS / 1000}s runtime, aborting`);
        break;
      }
      
      const response = await withRetry(
        async () => await fetch(feedUrl),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          onRetry: (attempt, error) => {
            console.log(`⏳ Retry ${attempt}/3 for ${feedUrl}: ${error.message}`);
          }
        }
      );
      
      const feedText = await response.text();
      
      // Parse RSS/Atom feed using regex
      const entryRegex = /<entry>(.*?)<\/entry>/gs;
      const itemRegex = /<item>(.*?)<\/item>/gs;
      
      const entries = [
        ...Array.from(feedText.matchAll(entryRegex)),
        ...Array.from(feedText.matchAll(itemRegex))
      ];
      
      for (const entryMatch of entries) {
        const entryContent = entryMatch[1];
        
        const titleMatch = entryContent.match(/<title>(.*?)<\/title>/i);
        const linkMatch = entryContent.match(/<link[^>]*>(.*?)<\/link>/i) || entryContent.match(/link\s+href="([^"]+)"/i);
        const summaryMatch = entryContent.match(/<summary>(.*?)<\/summary>/i) || entryContent.match(/<description>(.*?)<\/description>/i);
        
        if (!titleMatch || !linkMatch) continue;
        
        const title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim();
        const link = linkMatch[1].trim();
        const summary = summaryMatch ? summaryMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').trim() : '';
        
        // Check keywords
        const combinedText = `${title} ${summary}`.toLowerCase();
        const hasKeyword = keywords.some((kw: string) => combinedText.includes(kw.toLowerCase()));
        
        if (!hasKeyword) {
          skipped++;
          continue;
        }
        
        // Generate checksum
        const checksumData = JSON.stringify({ link, title });
        const encoder = new TextEncoder();
        const data = encoder.encode(checksumData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Insert signal with ON CONFLICT to handle duplicates
        const { error: insertError } = await supabaseClient
          .from('signals')
          .insert({
            signal_type: 'policy_approval',
            value_text: title,
            direction: 'up',
            magnitude: 1.0,
            observed_at: new Date().toISOString(),
            raw: { summary },
            citation: {
              source: 'Policy Feed',
              url: link,
              timestamp: new Date().toISOString()
            },
            source_id: feedUrl,
            checksum
          });
        
        if (insertError) {
          if (insertError.code === '23505') { // Duplicate key
            skipped++;
          } else {
            console.error('Insert error:', insertError);
            throw insertError;
          }
        } else {
          inserted++;
        }
      }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const latency = Date.now() - startTime;

    // Update log
    await supabaseClient.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      rows_inserted: inserted,
      source_used: sourceUsed,
      fallback_count: 0,
      latency_ms: latency,
    }).eq('id', logId);

    // @guard: Heartbeat log to function_status
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-policy-feeds',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      fallback_used: null,
      duration_ms: latency,
      source_used: sourceUsed,
      error_message: null,
      metadata: { feeds_processed: feed_urls.length }
    });

    // Send success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-policy-feeds',
      status: 'success',
      duration: durationSeconds,
      latencyMs: latency,
      sourceUsed,
      fallbackRatio: 0,
      rowsInserted: inserted,
      rowsSkipped: skipped
    });

    return new Response(JSON.stringify({ inserted, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // Update log with failure
    await supabaseClient.from('ingest_logs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      error_message: errorMessage,
    }).eq('id', logId);

    // @guard: Heartbeat log failure
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-policy-feeds',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      fallback_used: null,
      duration_ms: Date.now() - startTime,
      source_used: 'RSS Feeds',
      error_message: errorMessage,
      metadata: {}
    });

    // Log to ingest_failures
    await supabaseClient.from('ingest_failures').insert({
      etl_name: 'ingest-policy-feeds',
      ticker: null,
      error_type: 'unknown',
      error_message: errorMessage,
      status_code: null,
      retry_count: 0,
      failed_at: new Date().toISOString(),
      metadata: {}
    });

    // Send failure alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-policy-feeds',
      status: 'failed',
      duration: durationSeconds,
      errorMessage,
    });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
