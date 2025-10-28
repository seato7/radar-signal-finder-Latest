import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting patent filings ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const companies = [
      { name: 'Apple', ticker: 'AAPL' },
      { name: 'Microsoft', ticker: 'MSFT' },
      { name: 'NVIDIA', ticker: 'NVDA' },
    ];

    if (!perplexityKey) {
      console.log('Perplexity API key not configured');
      return new Response(
        JSON.stringify({ error: 'Perplexity API key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const patents = [];

    for (const company of companies) {
      console.log(`Fetching patents for ${company.name} via Perplexity...`);
      
      try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{
              role: 'system',
              content: 'You are a patent research assistant. Return only the requested data in the exact format specified.'
            }, {
              role: 'user',
              content: `Get 3 most recent patent filings for ${company.name} from USPTO or Google Patents. For each patent provide: PATENT_NUMBER: (e.g. US20250123456), TITLE: (patent title), DATE: (filing date YYYY-MM-DD), CATEGORY: (technology category like AI/ML, Hardware, Software), INVENTORS: (inventor names). Use real current data.`
            }],
            temperature: 0.1,
            max_tokens: 800,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices?.[0]?.message?.content || '';
          
          console.log(`Perplexity response for ${company.name}:`, content);
          
          // Parse the response for patent data
          const lines = content.split('\n');
          let currentPatent: any = {};
          
          for (const line of lines) {
            const numberMatch = line.match(/PATENT_NUMBER:\s*([A-Z0-9]+)/i);
            const titleMatch = line.match(/TITLE:\s*(.+)/i);
            const dateMatch = line.match(/DATE:\s*(\d{4}-\d{2}-\d{2})/i);
            const categoryMatch = line.match(/CATEGORY:\s*(.+)/i);
            const inventorsMatch = line.match(/INVENTORS?:\s*(.+)/i);
            
            if (numberMatch) {
              if (currentPatent.patent_number) {
                patents.push({
                  ticker: company.ticker,
                  company: company.name,
                  patent_number: currentPatent.patent_number,
                  patent_title: currentPatent.patent_title || 'Untitled',
                  filing_date: currentPatent.filing_date || new Date().toISOString().split('T')[0],
                  technology_category: currentPatent.technology_category || 'General',
                  metadata: {
                    inventors: currentPatent.inventors || ['Unknown'],
                    data_source: 'perplexity_uspto',
                  },
                  created_at: new Date().toISOString(),
                });
              }
              currentPatent = { patent_number: numberMatch[1] };
            }
            if (titleMatch) currentPatent.patent_title = titleMatch[1].trim();
            if (dateMatch) currentPatent.filing_date = dateMatch[1];
            if (categoryMatch) currentPatent.technology_category = categoryMatch[1].trim();
            if (inventorsMatch) currentPatent.inventors = inventorsMatch[1].split(',').map((i: string) => i.trim());
          }
          
          // Add last patent
          if (currentPatent.patent_number) {
            patents.push({
              ticker: company.ticker,
              company: company.name,
              patent_number: currentPatent.patent_number,
              patent_title: currentPatent.patent_title || 'Untitled',
              filing_date: currentPatent.filing_date || new Date().toISOString().split('T')[0],
              technology_category: currentPatent.technology_category || 'General',
              metadata: {
                inventors: currentPatent.inventors || ['Unknown'],
                data_source: 'perplexity_uspto',
              },
              created_at: new Date().toISOString(),
            });
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Error processing ${company.name}:`, err);
      }
    }

    if (patents.length > 0) {
      const { error } = await supabase
        .from('patent_filings')
        .insert(patents);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${patents.length} real patent records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: patents.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-patents:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
