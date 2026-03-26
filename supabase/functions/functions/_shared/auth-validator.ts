/**
 * API authentication validator with comprehensive error detection
 * Helps identify 401 errors caused by malformed requests, not just invalid keys
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export interface AuthValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  statusCode?: number;
}

/**
 * Validate request headers for common API authentication patterns
 */
export function validateAuthHeaders(
  headers: Record<string, string>,
  expectedFormat: 'bearer' | 'basic' | 'api-key' = 'bearer'
): AuthValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const authHeader = headers['Authorization'] || headers['authorization'];
  
  if (!authHeader) {
    errors.push('Missing Authorization header');
    return { isValid: false, errors, warnings };
  }

  switch (expectedFormat) {
    case 'bearer':
      if (!authHeader.startsWith('Bearer ')) {
        errors.push('Authorization header must start with "Bearer "');
      }
      const token = authHeader.replace('Bearer ', '');
      if (token.length < 10) {
        errors.push('Bearer token appears too short');
      }
      break;

    case 'basic':
      if (!authHeader.startsWith('Basic ')) {
        errors.push('Authorization header must start with "Basic "');
      }
      break;

    case 'api-key':
      // API key in header (e.g., X-API-Key)
      const apiKeyHeader = headers['X-API-Key'] || headers['x-api-key'];
      if (!apiKeyHeader) {
        warnings.push('No X-API-Key header found');
      }
      break;
  }

  // Check for common header formatting issues
  if (authHeader.includes('\n') || authHeader.includes('\r')) {
    errors.push('Authorization header contains newline characters');
  }

  if (authHeader.includes('  ')) {
    warnings.push('Authorization header contains double spaces');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Detect HTML masquerading as JSON (common 401/403 pattern)
 */
export function isHtmlResponse(contentType: string | null, body: string): boolean {
  // Check Content-Type header
  if (contentType && contentType.toLowerCase().includes('text/html')) {
    return true;
  }
  
  // Check if body starts with HTML tags
  const htmlPatterns = ['<!DOCTYPE', '<html', '<HTML', '<!doctype'];
  const trimmedBody = body.trim();
  return htmlPatterns.some(pattern => trimmedBody.startsWith(pattern));
}

/**
 * Validate API response for auth-related errors, including HTML masquerade detection
 */
export async function validateAuthResponse(
  response: Response,
  responseBody?: any
): Promise<AuthValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const statusCode = response.status;
  
  // CRITICAL: Detect HTML masquerading as JSON
  const contentType = response.headers.get('content-type');
  let bodyText: string | null = null;
  
  try {
    // Clone response to read body without consuming it
    const clonedResponse = response.clone();
    bodyText = await clonedResponse.text();
    
    if (isHtmlResponse(contentType, bodyText)) {
      errors.push('🚨 HTML MASQUERADE: API returned HTML login/error page instead of JSON');
      errors.push(`Content-Type: ${contentType || 'none'}`);
      errors.push(`Body preview: ${bodyText.substring(0, 200)}...`);
      
      return {
        isValid: false,
        errors,
        warnings,
        statusCode: 401 // Treat as auth error
      };
    }
  } catch (e) {
    warnings.push('Could not inspect response body for HTML');
  }

  if (statusCode === 401) {
    errors.push('Authentication failed (401 Unauthorized)');
    
    // Parse error message from response
    if (responseBody) {
      const errorMessage = 
        responseBody.error?.message ||
        responseBody.message ||
        responseBody.error ||
        JSON.stringify(responseBody);
      
      if (errorMessage.toLowerCase().includes('invalid')) {
        errors.push('API key appears to be invalid');
      } else if (errorMessage.toLowerCase().includes('expired')) {
        errors.push('API key or token has expired');
      } else if (errorMessage.toLowerCase().includes('missing')) {
        errors.push('API key or authentication parameter missing');
      } else {
        errors.push(`API error: ${errorMessage}`);
      }
    }
  } else if (statusCode === 403) {
    errors.push('Authorization failed (403 Forbidden) - check API permissions');
  } else if (statusCode === 429) {
    warnings.push('Rate limit exceeded (429) - will retry with backoff');
  }

  return {
    isValid: statusCode >= 200 && statusCode < 300,
    errors,
    warnings,
    statusCode
  };
}

/**
 * Zod schema for validating LLM API responses (OpenAI-compatible format)
 */
export const LLMAuthResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string()
    })
  })).min(1).optional(),
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.string().optional()
  }).optional()
});

/**
 * Validate LLM API request structure (OpenAI-compatible format)
 */
export function validateLLMRequest(payload: any): AuthValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload.model) {
    errors.push('Missing required field: model');
  }

  if (!payload.messages || !Array.isArray(payload.messages)) {
    errors.push('Missing or invalid field: messages (must be array)');
  } else if (payload.messages.length === 0) {
    errors.push('messages array cannot be empty');
  }

  if (payload.temperature !== undefined && 
      (payload.temperature < 0 || payload.temperature > 1)) {
    warnings.push('temperature should be between 0 and 1');
  }

  if (payload.max_tokens !== undefined && payload.max_tokens < 1) {
    errors.push('max_tokens must be positive');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Log auth failure with full context for debugging
 */
export async function logAuthFailure(
  supabase: any,
  etlName: string,
  provider: string,
  validationResult: AuthValidationResult,
  requestDetails?: Record<string, any>
) {
  await supabase.from('ingest_failures').insert({
    etl_name: etlName,
    ticker: null,
    error_type: 'api_auth',
    error_message: validationResult.errors.join('; '),
    status_code: validationResult.statusCode,
    retry_count: 0,
    failed_at: new Date().toISOString(),
    metadata: {
      provider,
      warnings: validationResult.warnings,
      request_details: requestDetails,
      timestamp: new Date().toISOString()
    }
  });
}
