/**
 * Centralized Perplexity API Client
 * Ensures correct endpoint, headers, HTML masquerade detection, and retry logic
 */

import { isHtmlResponse } from "./auth-validator.ts";

export interface PerplexityOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}

export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
    type?: string;
  };
}

/**
 * CRITICAL: Correct Perplexity API call with all safeguards
 * - Correct endpoint: https://api.perplexity.ai/chat/completions
 * - Required headers: Accept, User-Agent, Authorization
 * - HTML masquerade detection
 * - Exponential backoff retry
 */
export async function callPerplexity(
  messages: PerplexityMessage[],
  options: PerplexityOptions
): Promise<string> {
  const {
    apiKey,
    model = 'sonar',
    temperature = 0.2,
    maxTokens = 1000,
    maxRetries = 3
  } = options;

  // CRITICAL: Validate API key format
  if (!apiKey || apiKey.length < 20) {
    throw new Error('Invalid PERPLEXITY_API_KEY format');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // CRITICAL: Correct headers to prevent HTML masquerade
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'InsiderPulse/1.0'
      };

      console.log(`🔵 Perplexity API call (attempt ${attempt + 1}/${maxRetries + 1})`);

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      // CRITICAL: Get response text to check for HTML masquerade
      const responseText = await response.text();
      const contentType = response.headers.get('content-type');

      // CRITICAL: Detect HTML masquerade BEFORE parsing JSON
      if (isHtmlResponse(contentType, responseText)) {
        const error = new Error('HTML_MASQUERADE');
        console.error(`❌ Perplexity returned HTML instead of JSON`);
        console.error(`Content-Type: ${contentType}`);
        console.error(`Body preview: ${responseText.substring(0, 300)}`);
        
        // This is likely a persistent issue (wrong endpoint, bot detection)
        // Don't retry for HTML masquerade
        throw new Error(
          `Perplexity API returned HTML instead of JSON. This indicates:\n` +
          `1. Incorrect endpoint (must be api.perplexity.ai)\n` +
          `2. Bot detection triggered\n` +
          `3. Rate limit page displayed\n` +
          `Content-Type: ${contentType}\n` +
          `Preview: ${responseText.substring(0, 200)}`
        );
      }

      // Handle rate limits with exponential backoff
      if (response.status === 429) {
        if (attempt < maxRetries) {
          const backoffMs = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
          console.log(`⚠️ Rate limit (429), retrying in ${backoffMs.toFixed(0)}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        throw new Error('Perplexity rate limit exceeded after retries');
      }

      // Handle auth errors (don't retry)
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Perplexity authentication failed (${response.status}). ` +
          `Check PERPLEXITY_API_KEY is valid and has correct permissions.`
        );
      }

      // Parse JSON response
      let data: PerplexityResponse;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Failed to parse Perplexity JSON response: ${responseText.substring(0, 200)}`);
      }

      // Check for API errors in response
      if (data.error) {
        throw new Error(`Perplexity API error: ${data.error.message}`);
      }

      // Validate response structure
      if (!data.choices || data.choices.length === 0) {
        throw new Error('Perplexity returned empty choices array');
      }

      const content = data.choices[0].message.content;
      if (!content) {
        throw new Error('Perplexity returned empty content');
      }

      console.log(`✅ Perplexity API success (${content.length} chars)`);
      return content;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry for HTML masquerade or auth errors
      if (lastError.message.includes('HTML_MASQUERADE') || 
          lastError.message.includes('authentication failed')) {
        throw lastError;
      }

      // Retry for network errors
      if (attempt < maxRetries) {
        const backoffMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        console.log(`⏳ Retry ${attempt + 1}/${maxRetries}: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
    }
  }

  throw lastError || new Error('Perplexity API call failed');
}

/**
 * Helper: Simple query to Perplexity
 */
export async function queryPerplexity(
  query: string,
  apiKey: string,
  options?: Partial<PerplexityOptions>
): Promise<string> {
  return callPerplexity(
    [{ role: 'user', content: query }],
    { apiKey, ...options }
  );
}

/**
 * Test Perplexity API connection
 * Useful for debugging authentication issues
 */
export async function testPerplexityConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    const result = await queryPerplexity(
      'What is 2+2? Answer with just the number.',
      apiKey,
      { maxTokens: 10 }
    );
    
    return {
      success: true,
      message: 'Perplexity API connection successful',
      details: { response: result }
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      message: `Perplexity API connection failed: ${err.message}`,
      details: { error: err.message }
    };
  }
}
