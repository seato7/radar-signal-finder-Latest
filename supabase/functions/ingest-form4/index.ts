import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { limit = 100 } = await req.json();
    
    // Fetch Form 4 atom feed
    const SEC_USER_AGENT = "MyCompany info@example.com";
    const feedUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=${limit}&output=atom`;
    
    const feedResponse = await fetch(feedUrl, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        'Accept-Language': 'en-US'
      }
    });
    
    const feedText = await feedResponse.text();
    
    // Parse atom feed using regex (safer for edge functions)
    const entryRegex = /<entry>(.*?)<\/entry>/gs;
    const entries = Array.from(feedText.matchAll(entryRegex)).slice(0, limit);
    
    let signalsCreated = 0;
    let signalsSkipped = 0;
    
    for (const entryMatch of entries) {
      const entryContent = entryMatch[1];
      
      const linkMatch = entryContent.match(/<link\s+href="(.*?)"/i);
      const titleMatch = entryContent.match(/<title>(.*?)<\/title>/i);
      
      if (!linkMatch || !titleMatch) continue;
      
      const filingUrl = linkMatch[1];
      const titleText = titleMatch[1];
      
      // Extract ticker from title (format: "4 - TICKER (CompanyName)")
      const tickerMatch = titleText.match(/4\s*-\s*([A-Z]+)/);
      if (!tickerMatch) continue;
      
      const ticker = tickerMatch[1];
      
      // For demo: create insider signal without parsing full XML
      const checksumData = JSON.stringify({
        filing_url: filingUrl,
        ticker
      });
      
      const encoder = new TextEncoder();
      const data = encoder.encode(checksumData);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Check if exists
      const { data: existing } = await supabaseClient
        .from('signals')
        .select('id')
        .eq('checksum', checksum)
        .single();
      
      if (existing) {
        signalsSkipped++;
        continue;
      }
      
      // Find or create asset
      let { data: asset } = await supabaseClient
        .from('assets')
        .select('id')
        .eq('ticker', ticker)
        .eq('exchange', 'US')
        .single();
      
      if (!asset) {
        const { data: newAsset } = await supabaseClient
          .from('assets')
          .insert({
            ticker,
            exchange: 'US',
            name: ticker,
            metadata: {}
          })
          .select()
          .single();
        
        asset = newAsset;
      }
      
      // Insert insider signal
      await supabaseClient
        .from('signals')
        .insert({
          signal_type: 'insider_buy',
          asset_id: asset?.id,
          value_text: `Insider transaction: ${ticker}`,
          direction: 'up',
          magnitude: 1.0,
          observed_at: new Date().toISOString(),
          raw: {
            ticker,
            filing_url: filingUrl
          },
          citation: {
            source: 'SEC Form 4',
            url: filingUrl,
            timestamp: new Date().toISOString()
          },
          checksum
        });
      
      signalsCreated++;
    }

    return new Response(JSON.stringify({
      filings_processed: Math.min(limit, entries.length),
      signals_created: signalsCreated,
      signals_skipped: signalsSkipped
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
