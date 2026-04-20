import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface APILogEntry {
  api_name: string;
  endpoint?: string;
  function_name: string;
  status: 'success' | 'failure' | 'cached';
  response_time_ms?: number;
  error_message?: string;
}

/**
 * Logs API usage to the api_usage_logs table
 * @param supabaseAdmin - Admin Supabase client
 * @param entry - Log entry details
 */
export async function logAPIUsage(
  supabaseAdmin: SupabaseClient,
  entry: APILogEntry
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('api_usage_logs')
      .insert({
        api_name: entry.api_name,
        endpoint: entry.endpoint,
        function_name: entry.function_name,
        status: entry.status,
        response_time_ms: entry.response_time_ms,
        error_message: entry.error_message,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('[API-LOGGER] Failed to log API usage:', error);
    }
  } catch (err) {
    console.error('[API-LOGGER] Exception logging API usage:', err);
  }
}

/**
 * Wraps an API call with automatic logging
 * @param apiName - Name of the API being called
 * @param functionName - Name of the edge function making the call
 * @param apiCall - Async function that makes the API call
 * @param supabaseAdmin - Admin Supabase client
 */
export async function loggedAPICall<T>(
  apiName: string,
  functionName: string,
  apiCall: () => Promise<T>,
  supabaseAdmin: SupabaseClient
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await apiCall();
    const responseTime = Date.now() - startTime;
    
    await logAPIUsage(supabaseAdmin, {
      api_name: apiName,
      function_name: functionName,
      status: 'success',
      response_time_ms: responseTime
    });
    
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    await logAPIUsage(supabaseAdmin, {
      api_name: apiName,
      function_name: functionName,
      status: 'failure',
      response_time_ms: responseTime,
      error_message: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
}

/**
 * Logs a cached API call (no actual API request made)
 */
export async function logCachedCall(
  apiName: string,
  functionName: string,
  supabaseAdmin: SupabaseClient
): Promise<void> {
  await logAPIUsage(supabaseAdmin, {
    api_name: apiName,
    function_name: functionName,
    status: 'cached',
    response_time_ms: 0
  });
}

/**
 * Checks Yahoo Finance reliability and determines if fallback should be enabled
 * @param supabaseAdmin - Admin Supabase client
 * @returns Object with reliability stats and fallback recommendation
 */
export async function checkYahooReliability(
  supabaseAdmin: SupabaseClient
): Promise<{
  reliability_pct: number;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  should_enable_fallback: boolean;
}> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_yahoo_reliability');
    
    if (error || !data || data.length === 0) {
      console.warn('[API-LOGGER] Unable to check Yahoo reliability:', error);
      return {
        reliability_pct: 100,
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        should_enable_fallback: false
      };
    }
    
    return data[0];
  } catch (err) {
    console.error('[API-LOGGER] Exception checking Yahoo reliability:', err);
    return {
      reliability_pct: 100,
      total_calls: 0,
      successful_calls: 0,
      failed_calls: 0,
      should_enable_fallback: false
    };
  }
}
