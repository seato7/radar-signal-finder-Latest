/**
 * AI Fallback Utility
 * Provides Perplexity and Gemini fallbacks for data ingestion
 */

export async function fetchWithAIFallback(options: {
  ticker: string;
  dataType: string;
  primaryFetch: () => Promise<any>;
  promptTemplate: string;
  perplexityApiKey?: string;
  lovableApiKey?: string;
}): Promise<any> {
  const { ticker, dataType, primaryFetch, promptTemplate, perplexityApiKey, lovableApiKey } = options;

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

  // Try Perplexity fallback
  if (perplexityApiKey) {
    try {
      console.log(`🔄 Trying Perplexity fallback for ${ticker}...`);
      const data = await fetchFromPerplexity(ticker, promptTemplate, perplexityApiKey);
      if (data) {
        console.log(`✅ Perplexity fallback successful for ${ticker}`);
        return { success: true, data, source: 'perplexity' };
      }
    } catch (error) {
      console.error(`❌ Perplexity fallback failed for ${ticker}:`, error);
    }
  }

  // Try Gemini fallback
  if (lovableApiKey) {
    try {
      console.log(`🔄 Trying Gemini fallback for ${ticker}...`);
      const data = await fetchFromGemini(ticker, promptTemplate, lovableApiKey);
      if (data) {
        console.log(`✅ Gemini fallback successful for ${ticker}`);
        return { success: true, data, source: 'gemini' };
      }
    } catch (error) {
      console.error(`❌ Gemini fallback failed for ${ticker}:`, error);
    }
  }

  console.error(`💥 All methods failed for ${ticker}`);
  return { success: false, data: null, source: 'none' };
}

async function fetchFromPerplexity(ticker: string, promptTemplate: string, apiKey: string): Promise<any> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{
        role: 'user',
        content: promptTemplate.replace('{{ticker}}', ticker)
      }],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

async function fetchFromGemini(ticker: string, promptTemplate: string, apiKey: string): Promise<any> {
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
    throw new Error(`Gemini API error: ${response.status}`);
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
