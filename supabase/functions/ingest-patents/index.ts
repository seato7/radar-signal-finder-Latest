import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
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
  const slackAlerter = new SlackAlerter();
  let supabase: any;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting patent filings ingestion...');
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');

    const companies = [
      { name: 'Apple', ticker: 'AAPL' },
      { name: 'Microsoft', ticker: 'MSFT' },
      { name: 'NVIDIA', ticker: 'NVDA' },
    ];

    if (!perplexityKey) {
      console.log('⚠️ Perplexity API key not configured - using mock data');
      
      // Insert mock patent data
      const mockPatents = companies.map((company, idx) => ({
        ticker: company.ticker,
        company: company.name,
        patent_number: `US${11000000 + idx * 1000 + Math.floor(Math.random() * 1000)}`,
        patent_title: `Advanced ${['AI', 'Chip', 'Software'][idx]} Technology`,
        filing_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        technology_category: ['AI/ML', 'Hardware', 'Software'][idx],
        metadata: {
          data_source: 'mock_data',
          note: 'Sample patent data - configure PERPLEXITY_API_KEY for real data'
        },
      }));
      
      const { error } = await supabase.from('patent_filings').insert(mockPatents);
      
      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-patents',
        status: 'success',
        rows_inserted: mockPatents.length,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Mock Data',
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          count: mockPatents.length,
          note: 'Using mock data - configure PERPLEXITY_API_KEY for real patents'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const patents = [];
    let errorCount = 0;
    let successCount = 0;

    for (const company of companies) {
      console.log(`Fetching patents for ${company.name} via Perplexity...`);
      
      try {
        let response;
        let retries = 0;
        const maxRetries = 5; // Increased retries
        
        // Retry logic with exponential backoff
        while (retries <= maxRetries) {
          try {
            response = await fetch('https://api.perplexity.ai/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${perplexityKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'sonar',
                messages: [{
                  role: 'user',
                  content: `List 3 most recent ${company.name} patents. For each one line with: NUMBER|TITLE|DATE|CATEGORY
Example: US12345678|Neural network processor|2025-10-15|AI/ML`
                }],
                temperature: 0.1,
                max_tokens: 400,
              }),
            });
            
            // Check response status
            if (response.status === 429) {
              retries++;
              if (retries <= maxRetries) {
                const backoffMs = Math.min(2000 * Math.pow(2, retries), 30000);
                console.log(`⚠️ Rate limited for ${company.name}, retry ${retries}/${maxRetries} in ${backoffMs}ms`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
              }
              console.error(`❌ Rate limit exceeded for ${company.name} after ${maxRetries} retries`);
              errorCount++;
              break;
            }
            
            if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unable to read error response');
              console.error(`❌ Perplexity API error for ${company.name}: ${response.status} ${response.statusText} - ${errorText}`);
              retries++;
              if (retries <= maxRetries) {
                const backoffMs = Math.min(2000 * Math.pow(2, retries), 30000);
                console.log(`⚠️ API error for ${company.name}, retry ${retries}/${maxRetries} in ${backoffMs}ms`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
              }
              errorCount++;
              break;
            }
            
            // Success - parse response
            const data = await response.json();
            let content = data.choices?.[0]?.message?.content || '';
            
            console.log(`✅ Perplexity response for ${company.name}:`, content.substring(0, 200));
            
            // Parse pipe-delimited patent data
            const lines = content.split('\n').filter((l: string) => l.trim() && l.includes('|'));
            
            let companyPatents = 0;
            for (const line of lines.slice(0, 3)) {
              const parts = line.split('|').map((p: string) => p.trim());
              if (parts.length >= 3) {
                // Clean and parse the date
                let filingDate = new Date().toISOString().split('T')[0];
                if (parts[2]) {
                  // Extract just the date portion (YYYY-MM-DD or YYYY-MM or YYYY)
                  const dateMatch = parts[2].match(/(\d{4})-(\d{2})-(\d{2})|(\d{4})-(\d{2})|(\d{4})/);
                  if (dateMatch) {
                    if (dateMatch[1]) {
                      // Full date YYYY-MM-DD
                      filingDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                    } else if (dateMatch[4]) {
                      // YYYY-MM format
                      filingDate = `${dateMatch[4]}-${dateMatch[5]}-01`;
                    } else if (dateMatch[6]) {
                      // Just YYYY
                      filingDate = `${dateMatch[6]}-01-01`;
                    }
                  }
                }
                
                patents.push({
                  ticker: company.ticker,
                  company: company.name,
                  patent_number: parts[0] || `AUTO${Date.now()}_${companyPatents}`,
                  patent_title: parts[1] || 'Technology Patent',
                  filing_date: filingDate,
                  technology_category: parts[3] || 'Technology',
                  metadata: {
                    data_source: 'perplexity_uspto',
                    raw_line: line.substring(0, 200),
                    raw_date: parts[2],
                  },
                });
                companyPatents++;
              }
            }
            
            console.log(`✅ Parsed ${companyPatents} patents for ${company.name}`);
            successCount++;
            break; // Success, exit retry loop
            
          } catch (fetchError) {
            retries++;
            if (retries > maxRetries) {
              console.error(`❌ Failed to fetch patents for ${company.name} after ${maxRetries} retries:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
              errorCount++;
              break;
            }
            const backoffMs = Math.min(2000 * Math.pow(2, retries), 30000);
            console.log(`⚠️ Network error for ${company.name}, retry ${retries}/${maxRetries} in ${backoffMs}ms:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }

        // Rate limit between companies (longer delay)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`❌ Unexpected error processing ${company.name}:`, err instanceof Error ? err.message : String(err));
        errorCount++;
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

    await logHeartbeat(supabase, {
      function_name: 'ingest-patents',
      status: 'success',
      rows_inserted: patents.length,
      rows_skipped: errorCount,
      duration_ms: Date.now() - startTime,
      source_used: 'Perplexity USPTO',
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-patents',
      status: 'success',
      rowsInserted: patents.length,
      rowsSkipped: errorCount,
      sourceUsed: 'Perplexity USPTO',
      duration: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: patents.length, 
        errors: errorCount,
        companies_processed: companies.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-patents:', error);
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-patents',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Perplexity USPTO',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-patents',
      message: `Patents ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
