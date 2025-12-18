/**
 * Perplexity Backup - LAST RESORT fallback for when Firecrawl fails
 * 
 * ⚠️ WARNING: This uses a paid API - only use when absolutely necessary
 * 
 * USAGE RULES:
 * 1. ONLY use after Firecrawl has completely failed
 * 2. Log all usage for cost tracking
 * 3. NO ESTIMATION - Only return real search results
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai';

export interface PerplexitySearchResult {
  success: boolean;
  content?: string;
  citations?: string[];
  error?: string;
  source: 'perplexity';
  costWarning: boolean;
}

/**
 * Get API key from environment
 */
function getApiKey(): string | null {
  return Deno.env.get('PERPLEXITY_API_KEY') || null;
}

/**
 * Check if Perplexity is configured
 */
export function isPerplexityConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Search using Perplexity AI - LAST RESORT ONLY
 * 
 * @param query - Search query
 * @param context - Additional context for the search
 * @returns Search result with cost warning
 */
export async function searchWithPerplexity(
  query: string,
  context?: string
): Promise<PerplexitySearchResult> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.warn('[PerplexityBackup] API key not configured - backup unavailable');
    return {
      success: false,
      error: 'PERPLEXITY_API_KEY not configured',
      source: 'perplexity',
      costWarning: false,
    };
  }

  console.warn('[PerplexityBackup] ⚠️ USING PAID API - Ensure Firecrawl was tried first');

  const systemPrompt = `You are a financial data researcher. Provide accurate, factual information based on your search results.

RULES:
1. ONLY report information that you find in your search results
2. DO NOT estimate, guess, or make up any numbers or data
3. Include specific sources and dates when available
4. If you cannot find the requested information, say so clearly
5. Be concise but thorough

${context ? `Context: ${context}` : ''}`;

  try {
    const response = await fetch(`${PERPLEXITY_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PerplexityBackup] API error: ${response.status} - ${errorText}`);
      return {
        success: false,
        error: `Perplexity API error: ${response.status}`,
        source: 'perplexity',
        costWarning: true,
      };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    const citations = result.citations || [];

    if (!content) {
      return {
        success: false,
        error: 'No content returned from Perplexity',
        source: 'perplexity',
        costWarning: true,
      };
    }

    console.log(`[PerplexityBackup] Search successful, ${citations.length} citations`);

    return {
      success: true,
      content,
      citations,
      source: 'perplexity',
      costWarning: true, // Always warn about cost
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[PerplexityBackup] Exception: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      source: 'perplexity',
      costWarning: true,
    };
  }
}

/**
 * Search for financial data using Perplexity - LAST RESORT ONLY
 * Specialized for extracting financial metrics
 */
export async function searchFinancialData(
  ticker: string,
  dataType: 'dark_pool' | 'options' | 'short_interest' | 'sentiment' | 'earnings' | 'general'
): Promise<PerplexitySearchResult & { extractedData?: Record<string, any> }> {
  const queries: Record<string, string> = {
    dark_pool: `${ticker} dark pool volume percentage latest data FINRA ATS`,
    options: `${ticker} unusual options activity volume open interest latest`,
    short_interest: `${ticker} short interest percentage days to cover latest FINRA`,
    sentiment: `${ticker} stock social media sentiment Reddit Twitter latest`,
    earnings: `${ticker} earnings report results surprise latest quarter`,
    general: `${ticker} stock latest news analysis`,
  };

  const query = queries[dataType] || queries.general;
  
  console.warn(`[PerplexityBackup] Searching financial data for ${ticker} (${dataType})`);
  
  const result = await searchWithPerplexity(query, `Looking for ${dataType} data for stock ticker ${ticker}`);
  
  return {
    ...result,
    // Note: Actual data extraction would be done by lovable-extractor.ts
  };
}

/**
 * Log Perplexity usage for cost tracking
 * Should be called after every Perplexity API call
 */
export function logPerplexityUsage(
  supabase: any,
  functionName: string,
  query: string,
  success: boolean
): void {
  try {
    // Log to function_status for tracking
    supabase.from('function_status').insert({
      function_name: `perplexity-backup-${functionName}`,
      status: success ? 'success' : 'failed',
      metadata: {
        query: query.slice(0, 200),
        timestamp: new Date().toISOString(),
        cost_warning: 'PAID_API_USED',
      },
    }).then(() => {
      console.log(`[PerplexityBackup] Usage logged for ${functionName}`);
    }).catch((err: any) => {
      console.error(`[PerplexityBackup] Failed to log usage: ${err.message}`);
    });
  } catch (error) {
    console.error('[PerplexityBackup] Logging error:', error);
  }
}
