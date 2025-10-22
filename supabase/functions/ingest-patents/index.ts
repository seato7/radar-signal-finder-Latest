import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Major tech companies to track
    const companies = [
      { name: 'Apple Inc', ticker: 'AAPL' },
      { name: 'Microsoft Corporation', ticker: 'MSFT' },
      { name: 'Alphabet Inc', ticker: 'GOOGL' },
      { name: 'Amazon Technologies', ticker: 'AMZN' },
      { name: 'Tesla Inc', ticker: 'TSLA' },
      { name: 'Meta Platforms', ticker: 'META' },
      { name: 'NVIDIA Corporation', ticker: 'NVDA' },
    ];

    const patents = [];

    for (const company of companies) {
      console.log(`Fetching patents for ${company.name}...`);
      
      try {
        // USPTO API - public patent data
        const searchQuery = encodeURIComponent(company.name);
        const response = await fetch(
          `https://developer.uspto.gov/ibd-api/v1/patent/application?searchText=${searchQuery}&start=0&rows=20`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.log(`Failed to fetch patents for ${company.name}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const results = data.response?.docs || [];

        for (const patent of results) {
          patents.push({
            ticker: company.ticker,
            company: company.name,
            patent_number: patent.patentNumber || patent.applicationNumber || 'PENDING',
            patent_title: patent.inventionTitle || 'Untitled',
            filing_date: patent.appFilingDate || new Date().toISOString().split('T')[0],
            technology_category: patent.primaryClass || 'General',
            metadata: {
              inventors: patent.inventorName,
              abstract: patent.inventionAbstract?.slice(0, 500),
              status: patent.patentNumber ? 'granted' : 'pending',
            },
            created_at: new Date().toISOString(),
          });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`Error processing ${company.name}:`, err);
      }
    }

    // Insert into database
    if (patents.length > 0) {
      const { error } = await supabase
        .from('patent_filings')
        .upsert(patents, { 
          onConflict: 'ticker,patent_number',
          ignoreDuplicates: true 
        });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${patents.length} patent records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: patents.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-patents:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
