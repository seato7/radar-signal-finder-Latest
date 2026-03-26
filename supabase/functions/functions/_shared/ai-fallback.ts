/**
 * AI Fallback Utility
 * Provides Gemini AI fallback for data ingestion.
 * Migrated from Lovable gateway to direct Gemini API (callGemini).
 */

import { callGemini } from './gemini.ts';

export async function fetchWithAIFallback(options: {
  ticker: string;
  dataType: string;
  primaryFetch: () => Promise<any>;
  promptTemplate: string;
  lovableApiKey?: string; // kept for backwards-compat but no longer used
  maxRetries?: number;
}): Promise<any> {
  const { ticker, dataType, primaryFetch, promptTemplate } = options;

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

  // Try Gemini AI fallback
  try {
    console.log(`🔄 Trying Gemini AI fallback for ${ticker}...`);
    const prompt = promptTemplate.replace('{{ticker}}', ticker);
    const data = await callGemini(prompt, 500, 'text');
    if (data) {
      console.log(`✅ Gemini AI fallback successful for ${ticker}`);
      return { success: true, data, source: 'gemini_ai' };
    }
  } catch (error) {
    console.error(`❌ Gemini AI fallback failed for ${ticker}:`, error);
  }

  console.error(`💥 All methods failed for ${ticker}`);
  return { success: false, data: null, source: 'none' };
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
