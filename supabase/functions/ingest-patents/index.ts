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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const companies = [
      { name: 'Apple', ticker: 'AAPL', assignee: 'Apple Inc' },
      { name: 'Microsoft', ticker: 'MSFT', assignee: 'Microsoft Corporation' },
      { name: 'Google', ticker: 'GOOGL', assignee: 'Google LLC' },
      { name: 'Amazon', ticker: 'AMZN', assignee: 'Amazon Technologies' },
      { name: 'Tesla', ticker: 'TSLA', assignee: 'Tesla Inc' },
      { name: 'Meta', ticker: 'META', assignee: 'Meta Platforms' },
      { name: 'NVIDIA', ticker: 'NVDA', assignee: 'NVIDIA Corporation' },
    ];

    const patents = [];

    for (const company of companies) {
      console.log(`Fetching patents for ${company.name} via PatentsView...`);
      
      try {
        // Use PatentsView API v1 with proper POST body structure
        const requestBody = {
          q: {
            _and: [
              { assignee_organization: company.assignee }
            ]
          },
          f: [
            "patent_number",
            "patent_title", 
            "patent_date",
            "cpc_group_title",
            "inventor_first_name",
            "inventor_last_name"
          ],
          s: [{ patent_date: "desc" }],
          o: { per_page: 20 }
        };

        const response = await fetch(
          'https://search.patentsview.org/api/v1/patent/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'OpportunityRadar/1.0 (Educational Research)'
            },
            body: JSON.stringify(requestBody)
          }
        );

        if (!response.ok) {
          console.log(`PatentsView API failed for ${company.name}: ${response.status}`);
          const errorText = await response.text();
          console.log(`Error response: ${errorText}`);
          continue;
        }

        const data = await response.json();
        const results = data.patents || [];
        console.log(`Found ${results.length} patents for ${company.name}`);

        for (const patent of results) {
          const inventors = [];
          if (patent.inventors && patent.inventors.length > 0) {
            inventors.push(...patent.inventors.map((inv: any) => 
              `${inv.inventor_first_name || ''} ${inv.inventor_last_name || ''}`.trim()
            ));
          }

          const techCategory = patent.cpcs && patent.cpcs.length > 0 
            ? patent.cpcs[0].cpc_group_title || 'General'
            : 'General';

          patents.push({
            ticker: company.ticker,
            company: company.assignee,
            patent_number: patent.patent_number || 'PENDING',
            patent_title: patent.patent_title || 'Untitled',
            filing_date: patent.patent_date || new Date().toISOString().split('T')[0],
            technology_category: techCategory,
            metadata: {
              inventors: inventors.length > 0 ? inventors : ['Unknown'],
              data_source: 'patentsview_api',
              patent_date: patent.patent_date,
            },
            created_at: new Date().toISOString(),
          });
        }

        // Rate limiting - be respectful to free API
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err) {
        console.error(`Error processing ${company.name}:`, err);
      }
    }

    // Insert into database
    if (patents.length > 0) {
      const { error } = await supabase
        .from('patent_filings')
        .insert(patents);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${patents.length} real patent records`);
    } else {
      console.log('No patents fetched - using sample data as fallback');
      
      // Generate sample data as fallback
      const samplePatents = [];
      for (const company of companies) {
        for (let i = 0; i < 5; i++) {
          samplePatents.push({
            ticker: company.ticker,
            company: company.assignee,
            patent_number: `US${Math.floor(Math.random() * 1000000) + 10000000}`,
            patent_title: `${company.name} Innovation ${i + 1}`,
            filing_date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            technology_category: ['Software', 'Hardware', 'AI/ML', 'Networking'][Math.floor(Math.random() * 4)],
            metadata: {
              inventors: ['Sample Inventor'],
              data_source: 'sample_fallback',
            },
            created_at: new Date().toISOString(),
          });
        }
      }

      const { error } = await supabase
        .from('patent_filings')
        .insert(samplePatents);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, count: samplePatents.length, note: 'Sample data used as fallback' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
