/**
 * Lovable AI Extractor - Extract structured data from scraped content
 * Uses Lovable AI for intelligent data extraction
 * NO ESTIMATION - Returns only what can be extracted from real content
 */

const LOVABLE_API_URL = 'https://api.lovable.ai/v1';

export interface ExtractionSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required?: boolean;
  };
}

export interface ExtractionResult<T = Record<string, any>> {
  success: boolean;
  data?: T;
  error?: string;
  confidence?: number;
  source: 'lovable-ai';
}

/**
 * Get API key from environment
 */
function getApiKey(): string {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }
  return apiKey;
}

/**
 * Extract structured data from content using Lovable AI
 * NO ESTIMATION - Only returns data that can be confidently extracted
 */
export async function extractStructuredData<T = Record<string, any>>(
  content: string,
  schema: ExtractionSchema,
  context?: string
): Promise<ExtractionResult<T>> {
  if (!content || content.trim().length < 50) {
    return {
      success: false,
      error: 'Content too short for extraction',
      source: 'lovable-ai',
    };
  }

  const apiKey = getApiKey();
  
  // Build the extraction prompt
  const schemaDescription = Object.entries(schema)
    .map(([key, def]) => `- ${key} (${def.type}${def.required ? ', required' : ''}): ${def.description}`)
    .join('\n');

  const systemPrompt = `You are a precise data extraction assistant. Extract structured data from the provided content.

RULES:
1. ONLY extract data that is EXPLICITLY stated in the content
2. DO NOT infer, estimate, or make up any values
3. If a required field cannot be found, return null for that field
4. Return a valid JSON object matching the schema
5. For numbers, extract the exact value shown (convert "1.2M" to 1200000, etc.)
6. For dates, use ISO format (YYYY-MM-DD)

Schema to extract:
${schemaDescription}

${context ? `Additional context: ${context}` : ''}`;

  try {
    const response = await fetch(`${LOVABLE_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract data from this content:\n\n${content.slice(0, 15000)}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // Low temperature for precise extraction
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[LovableExtractor] API error: ${response.status} - ${errorData}`);
      return {
        success: false,
        error: `API error: ${response.status}`,
        source: 'lovable-ai',
      };
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content;

    if (!extractedText) {
      return {
        success: false,
        error: 'No extraction result returned',
        source: 'lovable-ai',
      };
    }

    // Parse the JSON response
    const extracted = JSON.parse(extractedText) as T;

    // Validate required fields
    const missingRequired = Object.entries(schema)
      .filter(([key, def]) => def.required && (extracted as any)[key] === null)
      .map(([key]) => key);

    if (missingRequired.length > 0) {
      console.warn(`[LovableExtractor] Missing required fields: ${missingRequired.join(', ')}`);
    }

    return {
      success: true,
      data: extracted,
      confidence: missingRequired.length === 0 ? 1.0 : 0.7,
      source: 'lovable-ai',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[LovableExtractor] Extraction failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      source: 'lovable-ai',
    };
  }
}

/**
 * Extract a list of items from tabular content
 * NO ESTIMATION - Only returns rows that can be parsed
 */
export async function extractTableData<T = Record<string, any>>(
  content: string,
  rowSchema: ExtractionSchema,
  tableContext?: string
): Promise<{
  success: boolean;
  rows: T[];
  error?: string;
}> {
  if (!content || content.trim().length < 100) {
    return {
      success: false,
      rows: [],
      error: 'Content too short for table extraction',
    };
  }

  const apiKey = getApiKey();

  const schemaDescription = Object.entries(rowSchema)
    .map(([key, def]) => `- ${key} (${def.type}): ${def.description}`)
    .join('\n');

  const systemPrompt = `You are a data table extraction assistant. Extract rows of data from the provided content.

RULES:
1. ONLY extract rows that are EXPLICITLY present in the content
2. DO NOT generate, estimate, or interpolate any data
3. Return an array of objects, each matching the row schema
4. Skip rows where required data cannot be determined
5. For numbers, extract exact values (handle formatting like "1.2M", "$500K", etc.)
6. If no valid rows can be extracted, return an empty array

Row schema:
${schemaDescription}

${tableContext ? `Table context: ${tableContext}` : ''}

Return format: { "rows": [...] }`;

  try {
    const response = await fetch(`${LOVABLE_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract table rows from this content:\n\n${content.slice(0, 20000)}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        rows: [],
        error: `API error: ${response.status}`,
      };
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content;

    if (!extractedText) {
      return {
        success: false,
        rows: [],
        error: 'No extraction result',
      };
    }

    const parsed = JSON.parse(extractedText);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

    console.log(`[LovableExtractor] Extracted ${rows.length} rows from table`);

    return {
      success: rows.length > 0,
      rows: rows as T[],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      rows: [],
      error: errorMessage,
    };
  }
}

/**
 * Extract sentiment and key metrics from financial news/text
 * NO ESTIMATION - Sentiment based only on content analysis
 */
export async function extractFinancialSentiment(
  content: string,
  ticker?: string
): Promise<{
  success: boolean;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  sentimentScore?: number; // -1 to 1
  keyPoints?: string[];
  mentionedTickers?: string[];
  error?: string;
}> {
  if (!content || content.trim().length < 50) {
    return {
      success: false,
      error: 'Content too short for sentiment analysis',
    };
  }

  const apiKey = getApiKey();

  const systemPrompt = `You are a financial sentiment analyzer. Analyze the provided content for market sentiment.

RULES:
1. Base sentiment ONLY on the actual content provided
2. DO NOT use external knowledge or assumptions
3. sentimentScore should be between -1 (very bearish) and 1 (very bullish)
4. Extract up to 5 key points mentioned in the content
5. List any stock tickers mentioned (format: uppercase like AAPL, MSFT)

Return JSON: {
  "sentiment": "bullish" | "bearish" | "neutral",
  "sentimentScore": number,
  "keyPoints": string[],
  "mentionedTickers": string[]
}`;

  try {
    const response = await fetch(`${LOVABLE_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${ticker ? `Focus on ${ticker}. ` : ''}Analyze this content:\n\n${content.slice(0, 10000)}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content;

    if (!extractedText) {
      return { success: false, error: 'No result returned' };
    }

    const parsed = JSON.parse(extractedText);

    return {
      success: true,
      sentiment: parsed.sentiment,
      sentimentScore: parsed.sentimentScore,
      keyPoints: parsed.keyPoints,
      mentionedTickers: parsed.mentionedTickers,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
