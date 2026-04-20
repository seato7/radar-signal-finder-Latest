/**
 * Circuit Breaker Utility
 * Auto-disables functions that fail repeatedly or exceed SLA thresholds
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface CircuitBreakerConfig {
  maxConsecutiveFailures: number; // Default: 3
  maxSlowCalls: number; // Default: 3
  slowThresholdMs: number; // Default: 30000 (30s)
  resetTimeoutMs: number; // Default: 300000 (5 min)
}

export interface CircuitBreakerStatus {
  function_name: string;
  is_open: boolean; // true = disabled, false = enabled
  consecutive_failures: number;
  consecutive_slow_calls: number;
  last_failure_at?: string;
  last_success_at?: string;
  opened_at?: string;
  reason?: string;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxConsecutiveFailures: 3,
  maxSlowCalls: 3,
  slowThresholdMs: 30000,
  resetTimeoutMs: 300000 // 5 minutes
};

export class CircuitBreaker {
  private supabase: SupabaseClient;
  private config: CircuitBreakerConfig;

  constructor(supabase: SupabaseClient, config?: Partial<CircuitBreakerConfig>) {
    this.supabase = supabase;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if circuit breaker is open (function disabled)
   */
  async isOpen(functionName: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('circuit_breaker_status')
        .select('*')
        .eq('function_name', functionName)
        .single();

      if (error || !data) return false;

      // Check if circuit should auto-reset
      if (data.is_open && data.opened_at) {
        const openedAt = new Date(data.opened_at).getTime();
        const now = Date.now();
        
        if (now - openedAt > this.config.resetTimeoutMs) {
          console.log(`🔄 Auto-resetting circuit breaker for ${functionName}`);
          await this.reset(functionName);
          return false;
        }
      }

      return data.is_open || false;
    } catch (err) {
      console.error('Circuit breaker check error:', err);
      return false; // Fail open (allow execution)
    }
  }

  /**
   * Record a successful execution
   */
  async recordSuccess(functionName: string, durationMs: number): Promise<void> {
    try {
      const { data: existing } = await this.supabase
        .from('circuit_breaker_status')
        .select('*')
        .eq('function_name', functionName)
        .single();

      if (existing) {
        // Reset failure counters on success
        await this.supabase
          .from('circuit_breaker_status')
          .update({
            consecutive_failures: 0,
            consecutive_slow_calls: durationMs > this.config.slowThresholdMs 
              ? (existing.consecutive_slow_calls || 0) + 1 
              : 0,
            last_success_at: new Date().toISOString(),
            is_open: false // Close circuit on success
          })
          .eq('function_name', functionName);
      } else {
        // Create new entry
        await this.supabase
          .from('circuit_breaker_status')
          .insert({
            function_name: functionName,
            is_open: false,
            consecutive_failures: 0,
            consecutive_slow_calls: 0,
            last_success_at: new Date().toISOString()
          });
      }

      // Check if slow calls threshold exceeded
      if (existing && existing.consecutive_slow_calls >= this.config.maxSlowCalls - 1) {
        await this.open(functionName, `Exceeded ${this.config.maxSlowCalls} consecutive slow calls (>${this.config.slowThresholdMs}ms)`);
      }
    } catch (err) {
      console.error('Circuit breaker recordSuccess error:', err);
    }
  }

  /**
   * Record a failed execution
   */
  async recordFailure(functionName: string, reason: string): Promise<void> {
    try {
      const { data: existing } = await this.supabase
        .from('circuit_breaker_status')
        .select('*')
        .eq('function_name', functionName)
        .single();

      const newFailureCount = (existing?.consecutive_failures || 0) + 1;

      await this.supabase
        .from('circuit_breaker_status')
        .upsert({
          function_name: functionName,
          consecutive_failures: newFailureCount,
          consecutive_slow_calls: existing?.consecutive_slow_calls || 0,
          last_failure_at: new Date().toISOString(),
          is_open: existing?.is_open || false
        }, { onConflict: 'function_name' });

      // Open circuit if threshold exceeded
      if (newFailureCount >= this.config.maxConsecutiveFailures) {
        await this.open(functionName, `Exceeded ${this.config.maxConsecutiveFailures} consecutive failures: ${reason}`);
      }
    } catch (err) {
      console.error('Circuit breaker recordFailure error:', err);
    }
  }

  /**
   * Manually open the circuit breaker (disable function)
   */
  async open(functionName: string, reason: string): Promise<void> {
    console.warn(`⚠️ CIRCUIT BREAKER OPENED for ${functionName}: ${reason}`);
    
    await this.supabase
      .from('circuit_breaker_status')
      .upsert({
        function_name: functionName,
        is_open: true,
        opened_at: new Date().toISOString(),
        reason
      }, { onConflict: 'function_name' });
  }

  /**
   * Manually reset/close the circuit breaker (re-enable function)
   */
  async reset(functionName: string): Promise<void> {
    console.log(`✅ Circuit breaker RESET for ${functionName}`);
    
    await this.supabase
      .from('circuit_breaker_status')
      .update({
        is_open: false,
        consecutive_failures: 0,
        consecutive_slow_calls: 0,
        opened_at: null,
        reason: null
      })
      .eq('function_name', functionName);
  }

  /**
   * Get status for all circuit breakers
   */
  async getAllStatus(): Promise<CircuitBreakerStatus[]> {
    const { data, error } = await this.supabase
      .from('circuit_breaker_status')
      .select('*')
      .order('function_name');

    if (error) {
      console.error('Failed to fetch circuit breaker status:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get status for a specific function
   */
  async getStatus(functionName: string): Promise<CircuitBreakerStatus | null> {
    const { data, error } = await this.supabase
      .from('circuit_breaker_status')
      .select('*')
      .eq('function_name', functionName)
      .single();

    if (error || !data) return null;
    return data;
  }
}
