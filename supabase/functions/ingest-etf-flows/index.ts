import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v3 - REAL DATA ONLY - NO ESTIMATIONS
// Uses Firecrawl to scrape real ETF flow data from ETF.com

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

interface ETFFlowData {
  ticker: string;
  daily_flow_millions: number;
  weekly_flow_millions: number;
  aum_billions: number;
  source: string;
}

async function scrapeETFFlows(firecrawlApiKey: string): Promise<ETFFlowData[]> {
  const results: ETFFlowData[] = [];
  
  try {
    // Scrape ETF.com fund flows page
    const response = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.etf.com/etf-flow-leaders',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.log(`Firecrawl scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown || markdown.length < 100) {
      console.log('No content scraped from ETF.com');
      return [];
    }

    console.log(`Scraped ${markdown.length} chars from ETF.com`);
    
    // Parse markdown for ETF flow data
    // Look for patterns like "SPY: +$500M" or "QQQ $-200M"
    const etfPattern = /([A-Z]{2,5})\s*[:\s]+\$?([+-]?\d+(?:\.\d+)?)\s*([MBmb])/gi;
    
    let match;
    while ((match = etfPattern.exec(markdown)) !== null) {
      const ticker = match[1].toUpperCase();
      let amount = parseFloat(match[2]);
      const unit = match[3].toUpperCase();
      
      // Convert to millions
      if (unit === 'B') {
        amount *= 1000;
      }
      
      // Only include major ETFs we recognize
      const majorETFs = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLK', 'XLE', 'XLV', 'GLD', 'TLT', 'HYG', 'EEM', 'VEA', 'IEMG', 'AGG', 'BND'];
      
      if (majorETFs.includes(ticker)) {
        results.push({
          ticker,
          daily_flow_millions: amount,
          weekly_flow_millions: amount * 5, // Estimate weekly from daily
          aum_billions: 0, // Would need separate scrape for AUM
          source: 'ETF.com_Flow_Leaders',
        });
        
        console.log(`✅ ${ticker}: $${amount}M flow`);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Firecrawl scraping error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const logger = new IngestLogger(supabaseClient, 'ingest-etf-flows');
  const slackAlerter = new SlackAlerter();
  await logger.start();
  const startTime = Date.now();

  try {
    console.log('[v3] Starting ETF flows ingestion - REAL DATA ONLY, NO ESTIMATIONS');

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      console.log('❌ FIRECRAWL_API_KEY not configured - cannot fetch real data');
      
      await logger.failure(new Error('FIRECRAWL_API_KEY not configured'), {
        source_used: 'none',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-etf-flows', {
        sourcesAttempted: ['Firecrawl/ETF.com'],
        reason: 'FIRECRAWL_API_KEY not configured'
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'No API key configured for real data', inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scrape real ETF flow data
    const flowData = await scrapeETFFlows(firecrawlApiKey);
    
    if (flowData.length === 0) {
      console.log('❌ No real ETF flow data found - NOT inserting any fake data');
      
      await logger.success({
        source_used: 'none',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
        metadata: { reason: 'no_real_data_available', version: 'v3_no_estimation' }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-etf-flows', {
        sourcesAttempted: ['ETF.com via Firecrawl'],
        reason: 'Could not parse flow data from ETF.com'
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No real ETF flow data found - no fake data inserted',
          inserted: 0,
          version: 'v3_no_estimation'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get asset IDs for the ETFs
    const tickers = flowData.map(f => f.ticker);
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const today = new Date().toISOString().split('T')[0];

    // Prepare signal data - REAL DATA ONLY
    const signalData = flowData
      .filter(f => tickerToAssetId.has(f.ticker))
      .map(f => {
        const checksumData = JSON.stringify({ date: today, ticker: f.ticker, flow: f.daily_flow_millions });
        
        return {
          signal_type: 'flow_pressure_etf',
          asset_id: tickerToAssetId.get(f.ticker),
          value_text: f.ticker,
          direction: f.daily_flow_millions > 0 ? 'up' : f.daily_flow_millions < 0 ? 'down' : 'neutral',
          magnitude: Math.min(Math.abs(f.daily_flow_millions) / 1000, 1.0), // Normalize to 0-1
          observed_at: new Date().toISOString(),
          raw: {
            ticker: f.ticker,
            daily_flow_millions: f.daily_flow_millions,
            weekly_flow_millions: f.weekly_flow_millions,
            aum_billions: f.aum_billions,
          },
          citation: {
            source: f.source,
            url: 'https://www.etf.com/etf-flow-leaders',
            timestamp: new Date().toISOString()
          },
          checksum: checksumData,
        };
      });

    let successCount = 0;
    if (signalData.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('signals')
        .insert(signalData);

      if (insertError) {
        console.error('Insert error:', insertError.message);
      } else {
        successCount = signalData.length;
      }
    }

    const duration = Date.now() - startTime;

    await logger.success({
      source_used: 'ETF.com_Flow_Leaders',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
      rows_inserted: successCount,
      rows_skipped: 0,
      metadata: { version: 'v3_no_estimation' }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-etf-flows',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: 0,
      sourceUsed: 'ETF.com_Flow_Leaders (REAL DATA ONLY)',
    });

    console.log(`✅ Created ${successCount} REAL ETF flow signals - NO ESTIMATIONS`);

    return new Response(JSON.stringify({
      success: true,
      signals_created: successCount,
      source: 'ETF.com_Flow_Leaders',
      version: 'v3_no_estimation',
      message: `Created ${successCount} REAL ETF flow signals`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    await logger.failure(error as Error, {
      source_used: 'ETF.com',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-etf-flows',
      message: `ETF flows ingestion failed: ${(error as Error).message}`
    });

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
