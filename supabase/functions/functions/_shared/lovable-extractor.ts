/**
 * Gemini AI Extractor - Extract structured data from scraped content
 * Migrated from Lovable API to direct Gemini API (callGemini).
 * NO ESTIMATION - Returns only what can be extracted from real content
 */

import { callGemini } from './gemini.ts';

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
  source: string;
}

/**
 * Extract structured data from content using Gemini AI.
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
      source: 'gemini',
    };
  }

  // Build the extraction prompt
  const schemaDescription = Object.entries(schema)
    .map(([key, def]) => `- ${key} (${def.type}${def.required ? ', required' : ''}): ${def.description}`)
    .join('\n');

  const prompt = `You are a precise data extraction assistant. Extract structured data from the provided content.

RULES:
1. ONLY extract data that is EXPLICITLY stated in the content
2. DO NOT infer, estimate, or make up any values
3. If a required field cannot be found, return null for that field
4. Return a valid JSON object matching the schema
5. For numbers, extract the exact value shown (convert "1.2M" to 1200000, etc.)
6. For dates, use ISO format (YYYY-MM-DD)

Schema to extract:
${schemaDescription}

${context ? `Additional context: ${context}` : ''}

Extract data from this content:

${content.slice(0, 15000)}`;

  try {
    const aiContent = await callGemini(prompt, 2000);

    if (!aiContent) {
      return {
        success: false,
        error: 'No extraction result returned',
        source: 'gemini',
      };
    }

    // Parse the JSON response
    const extracted = JSON.parse(aiContent) as T;

    // Validate required fields
    const missingRequired = Object.entries(schema)
      .filter(([key, def]) => def.required && (extracted as any)[key] === null)
      .map(([key]) => key);

    if (missingRequired.length > 0) {
      console.warn(`[GeminiExtractor] Missing required fields: ${missingRequired.join(', ')}`);
    }

    return {
      success: true,
      data: extracted,
      confidence: missingRequired.length === 0 ? 1.0 : 0.7,
      source: 'gemini',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GeminiExtractor] Extraction failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      source: 'gemini',
    };
  }
}

/**
 * Extract a list of items from tabular content.
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

  const schemaDescription = Object.entries(rowSchema)
    .map(([key, def]) => `- ${key} (${def.type}): ${def.description}`)
    .join('\n');

  const prompt = `You are a data table extraction assistant. Extract rows of data from the provided content.

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

Return format: { "rows": [...] }

Extract table rows from this content:

${content.slice(0, 20000)}`;

  try {
    const aiContent = await callGemini(prompt, 4000);

    if (!aiContent) {
      return {
        success: false,
        rows: [],
        error: 'No extraction result',
      };
    }

    const parsed = JSON.parse(aiContent);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

    console.log(`[GeminiExtractor] Extracted ${rows.length} rows from table`);

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
 * Extract sentiment and key metrics from financial news/text.
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

  const prompt = `You are a financial sentiment analyzer. Analyze the provided content for market sentiment.

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
}

${ticker ? `Focus on ${ticker}. ` : ''}Analyze this content:

${content.slice(0, 10000)}`;

  try {
    const aiContent = await callGemini(prompt, 500);

    if (!aiContent) {
      return { success: false, error: 'No result returned' };
    }

    const parsed = JSON.parse(aiContent);

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
