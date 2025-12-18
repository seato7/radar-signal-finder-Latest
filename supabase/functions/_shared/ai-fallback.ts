/**
 * AI Fallback Utility
 * Provides Lovable AI (Gemini) fallback for data ingestion
 * NOTE: Perplexity has been removed - use Firecrawl + Lovable AI instead
 */

export async function fetchWithAIFallback(options: {
  ticker: string;
  dataType: string;
  primaryFetch: () => Promise<any>;
  promptTemplate: string;
  lovableApiKey?: string;
  maxRetries?: number;
}): Promise<any> {
  const { ticker, dataType, primaryFetch, promptTemplate, lovableApiKey, maxRetries = 3 } = options;

  try {
    // Try primary source first
    console.log(`🎯 Attempting primary fetch for ${ticker} ${dataType}...`);
    const result = await primaryFetch();
    if (result) {
      console.log(`✅ Primary fetch successful for ${ticker}`);
      return { success: true, data: result, source: 'primary' };
    }
  } catch (error) {
    console.error(`❌ Primary fetch failed for ${ticker}:`, error);
  }

  // Try Lovable AI (Gemini) fallback
  if (lovableApiKey) {
    try {
      console.log(`🔄 Trying Lovable AI fallback for ${ticker}...`);
      const data = await fetchFromLovableAI(ticker, promptTemplate, lovableApiKey);
      if (data) {
        console.log(`✅ Lovable AI fallback successful for ${ticker}`);
        return { success: true, data, source: 'lovable_ai' };
      }
    } catch (error) {
      console.error(`❌ Lovable AI fallback failed for ${ticker}:`, error);
    }
  }

  console.error(`💥 All methods failed for ${ticker}`);
  return { success: false, data: null, source: 'none' };
}

async function fetchFromLovableAI(ticker: string, promptTemplate: string, apiKey: string): Promise<any> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: promptTemplate.replace('{{ticker}}', ticker)
      }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lovable AI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

export function parseAIResponse(content: string, fields: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const field of fields) {
    const pattern = new RegExp(`${field}:\\s*([\\d.\\-]+|\\w+)`, 'i');
    const match = content.match(pattern);
    if (match) {
      const value = match[1];
      // Try to parse as number
      const numValue = parseFloat(value);
      result[field] = isNaN(numValue) ? value : numValue;
    }
  }
  
  return result;
}
