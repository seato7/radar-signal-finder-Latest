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

    // Fetch companies dynamically from assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name')
      .eq('asset_class', 'stock')
      .limit(15); // Process 15 companies per run
    
    if (assetsError) throw assetsError;
    
    const companies = assets?.map((a: any) => ({ name: a.name, ticker: a.ticker })) || [];

    if (!perplexityKey) {
      console.log('⚠️ Perplexity API key not configured - using mock data');
      
      // Insert mock patent data
      const mockPatents = companies.map((company: any, idx: number) => ({
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
        const maxRetries = 3;
        let lastError: Error | null = null;
        
        // Retry logic with exponential backoff
        while (retries <= maxRetries) {
          try {
            console.log(`🔄 Fetching patents for ${company.name}, attempt ${retries + 1}/${maxRetries + 1}`);
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
              const backoffMs = Math.min(3000 * Math.pow(2, retries), 60000);
              console.log(`⚠️ Rate limited for ${company.name}, retry ${retries + 1}/${maxRetries + 1} in ${backoffMs}ms`);
              lastError = new Error(`Rate limited (429)`);
              retries++;
              if (retries <= maxRetries) {
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
              }
              console.error(`❌ Rate limit exceeded for ${company.name} after ${maxRetries + 1} attempts`);
              errorCount++;
              break;
            }
            
            if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unable to read error response');
              const backoffMs = Math.min(3000 * Math.pow(2, retries), 60000);
              lastError = new Error(`API error ${response.status}: ${errorText}`);
              console.error(`❌ Perplexity API error for ${company.name}: ${response.status} - ${errorText}`);
              retries++;
              if (retries <= maxRetries) {
                console.log(`⚠️ Retrying ${company.name} in ${backoffMs}ms (${retries + 1}/${maxRetries + 1})`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
              }
              console.error(`❌ Failed for ${company.name} after ${maxRetries + 1} attempts`);
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
                // Robust date extraction and parsing
                let filingDate = new Date().toISOString().split('T')[0];
                if (parts[2]) {
                  const dateStr = parts[2];
                  
                  // Try multiple date formats, prioritize most specific to least specific
                  // 1. Full date: YYYY-MM-DD
                  let dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
                  if (dateMatch) {
                    filingDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                  } else {
                    // 2. Year-Month: YYYY-MM or "YYYY-MM (anything)"
                    dateMatch = dateStr.match(/(\d{4})-(\d{2})/);
                    if (dateMatch) {
                      filingDate = `${dateMatch[1]}-${dateMatch[2]}-01`;
                    } else {
                      // 3. Just year anywhere in the string: extract first 4-digit number
                      dateMatch = dateStr.match(/\b(20\d{2})\b/);
                      if (dateMatch) {
                        filingDate = `${dateMatch[1]}-01-01`;
                      }
                      // If no year found at all, use current date (already set above)
                    }
                  }
                  
                  console.log(`📅 Date parsing: "${dateStr}" → ${filingDate}`);
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
            const backoffMs = Math.min(3000 * Math.pow(2, retries), 60000);
            lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
            console.error(`❌ Network error for ${company.name}:`, lastError.message);
            retries++;
            if (retries > maxRetries) {
              console.error(`❌ Failed to fetch patents for ${company.name} after ${maxRetries + 1} attempts:`, lastError.message);
              errorCount++;
              break;
            }
            console.log(`⚠️ Network error, retry ${retries + 1}/${maxRetries + 1} in ${backoffMs}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }

        // If we exhausted retries and have an error, log it
        if (retries > maxRetries && lastError) {
          console.error(`❌ All retries exhausted for ${company.name}:`, lastError.message);
        }

        // Rate limit between companies
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Unexpected error processing ${company.name}:`, errorMsg);
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('❌ Fatal error in ingest-patents:', errorMsg);
    if (errorStack) {
      console.error('Stack trace:', errorStack);
    }
    
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-patents',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Perplexity USPTO',
        error_message: errorMsg,
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-patents',
      message: `Patents ingestion failed: ${errorMsg}`,
    });
    
    return new Response(
      JSON.stringify({ error: errorMsg, stack: errorStack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
