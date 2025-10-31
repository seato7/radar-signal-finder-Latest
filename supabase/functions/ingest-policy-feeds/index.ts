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
    const { feed_urls, keywords } = await req.json();
    
    if (!feed_urls || !keywords || feed_urls.length === 0 || keywords.length === 0) {
      throw new Error('feed_urls and keywords required');
    }
    
    let inserted = 0;
    let skipped = 0;
    
    for (const feedUrl of feed_urls) {
      const response = await fetch(feedUrl);
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
        
        // Check exists
        const { data: existing } = await supabaseClient
          .from('signals')
          .select('id')
          .eq('checksum', checksum)
          .single();
        
        if (existing) {
          skipped++;
          continue;
        }
        
        // Insert signal
        await supabaseClient
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
        
        inserted++;
      }
    }

    return new Response(JSON.stringify({ inserted, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
