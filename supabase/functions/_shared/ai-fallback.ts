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
  maxRetries?: number;
}): Promise<any> {
  const { ticker, dataType, primaryFetch, promptTemplate, perplexityApiKey, lovableApiKey, maxRetries = 3 } = options;

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

async function fetchFromPerplexity(ticker: string, promptTemplate: string, apiKey: string, retryCount = 0, maxRetries = 3): Promise<any> {
  console.log(`Attempting Perplexity for ${ticker} (attempt ${retryCount + 1}/${maxRetries})`);
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: promptTemplate.replace('{{ticker}}', ticker)
      }],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });

  // PHASE 5: Handle rate limits with exponential backoff retry
  if (response.status === 429) {
    if (retryCount < maxRetries) {
      const backoffMs = 1000 * Math.pow(2, retryCount);
      console.log(`⚠️ Perplexity rate limit for ${ticker}, retrying in ${backoffMs}ms`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return fetchFromPerplexity(ticker, promptTemplate, apiKey, retryCount + 1, maxRetries);
    } else {
      throw new Error(`Perplexity rate limit exceeded after ${maxRetries} retries`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
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
