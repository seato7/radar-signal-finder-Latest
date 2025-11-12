/**
 * Redis Cache Utility for Real-Time Data Pipeline
 * Implements 5-second TTL caching with Upstash Redis
 * 
 * SLA: All market data must be ≤5 seconds old
 */

interface CacheEntry {
  ticker: string;
  price?: number;
  data: any;
  source: string;
  fetched_at: string;
  verified_source?: string;
}

interface CacheGetResult {
  hit: boolean;
  data: any | null;
  age_seconds?: number;
}

export class RedisCache {
  private baseUrl: string;
  private token: string;
  private ttl: number = 5; // Hard 5-second TTL for all market data

  constructor() {
    this.baseUrl = Deno.env.get('UPSTASH_REDIS_REST_URL') || '';
    this.token = Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '';
    
    if (!this.baseUrl || !this.token) {
      console.warn('⚠️ Redis not configured, caching disabled');
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  /**
   * Get cached data for a ticker
   * Returns null if cache miss or data is stale (>5s)
   */
  async get(key: string): Promise<CacheGetResult> {
    if (!this.isConfigured()) {
      return { hit: false, data: null };
    }

    try {
      const response = await fetch(`${this.baseUrl}/get/${key}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.ok) {
        console.error(`Redis GET error: ${response.status}`);
        return { hit: false, data: null };
      }

      const result = await response.json();
      
      if (!result.result) {
        return { hit: false, data: null };
      }

      const cached: CacheEntry = JSON.parse(result.result);
      const ageSeconds = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;

      // Reject stale data (>5s)
      if (ageSeconds > this.ttl) {
        console.log(`🔄 Cache expired for ${key} (${ageSeconds.toFixed(1)}s old)`);
        await this.delete(key); // Clean up stale entry
        return { hit: false, data: null };
      }

      console.log(`✅ Cache HIT for ${key} (${ageSeconds.toFixed(1)}s old)`);
      return { 
        hit: true, 
        data: cached.data,
        age_seconds: ageSeconds 
      };

    } catch (error) {
      console.error('Redis GET error:', error);
      return { hit: false, data: null };
    }
  }

  /**
   * Set cached data with 5-second TTL
   * Records source for verification
   */
  async set(key: string, data: any, source: string, verified_source?: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const entry: CacheEntry = {
        ticker: key,
        data,
        source,
        fetched_at: new Date().toISOString(),
        verified_source
      };

      // Use SETEX for atomic set + TTL - value must be JSON string
      const response = await fetch(`${this.baseUrl}/setex/${key}/${this.ttl}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(entry)
      });

      if (!response.ok) {
        console.error(`Redis SET error: ${response.status}`);
        return false;
      }

      console.log(`💾 Cached ${key} for ${this.ttl}s (source: ${source})`);
      return true;

    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  /**
   * Delete a cache entry (for stale cleanup)
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/del/${key}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      return response.ok;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  /**
   * Check if data exists and is fresh (<5s)
   */
  async isFresh(key: string): Promise<boolean> {
    const result = await this.get(key);
    return result.hit && (result.age_seconds || 0) < this.ttl;
  }

  /**
   * Get multiple keys in parallel
   */
  async mget(keys: string[]): Promise<Record<string, any>> {
    if (!this.isConfigured() || keys.length === 0) {
      return {};
    }

    const results = await Promise.all(
      keys.map(async (key) => {
        const result = await this.get(key);
        return [key, result.data];
      })
    );

    return Object.fromEntries(results.filter(([_, data]) => data !== null));
  }

  /**
   * Flush all cache (use with caution)
   */
  async flushAll(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/flushall`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      return response.ok;
    } catch (error) {
      console.error('Redis FLUSHALL error:', error);
      return false;
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCache();
