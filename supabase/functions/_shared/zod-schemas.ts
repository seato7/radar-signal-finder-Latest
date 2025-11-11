/**
 * Shared Zod Validation Schemas for Data Ingestion
 * 
 * Provides strict validation for external API responses to prevent:
 * - Data corruption from malformed responses
 * - XSS attacks via unsanitized strings
 * - Database errors from oversized data
 * - Type coercion vulnerabilities
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============= COMMON VALIDATORS =============

/**
 * Sanitized string validator with strict length limits
 */
export const SanitizedString = (maxLength: number) => z
  .string()
  .trim()
  .max(maxLength, `String exceeds ${maxLength} character limit`)
  .transform(str => str.replace(/[<>]/g, '')); // Remove potential XSS chars

/**
 * Ticker validator (uppercase alphanumeric + slash for forex)
 */
export const TickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(20)
  .regex(/^[A-Z0-9\/\-]+$/, 'Invalid ticker format');

/**
 * Sentiment score validator (-1 to 1)
 */
export const SentimentScoreSchema = z
  .number()
  .min(-1, 'Sentiment must be >= -1')
  .max(1, 'Sentiment must be <= 1')
  .or(z.string().transform(Number).pipe(z.number().min(-1).max(1)));

/**
 * Percentage validator (0 to 100)
 */
export const PercentageSchema = z
  .number()
  .min(0)
  .max(100)
  .or(z.string().transform(Number).pipe(z.number().min(0).max(100)));

/**
 * Positive number validator
 */
export const PositiveNumberSchema = z
  .number()
  .positive()
  .or(z.string().transform(Number).pipe(z.number().positive()));

// ============= YAHOO FINANCE SCHEMAS =============

export const YahooQuoteSchema = z.object({
  close: z.array(z.number().nullable()),
  open: z.array(z.number().nullable()).optional(),
  high: z.array(z.number().nullable()).optional(),
  low: z.array(z.number().nullable()).optional(),
  volume: z.array(z.number().nullable()).optional(),
});

export const YahooChartResultSchema = z.object({
  timestamp: z.array(z.number()),
  indicators: z.object({
    quote: z.array(YahooQuoteSchema),
  }),
});

export const YahooResponseSchema = z.object({
  chart: z.object({
    result: z.array(YahooChartResultSchema).min(1),
    error: z.any().optional(),
  }),
});

// ============= PERPLEXITY / AI SCHEMAS =============

export const PerplexityMessageSchema = z.object({
  content: SanitizedString(10000), // Strict limit on AI responses
  role: z.enum(['assistant', 'user', 'system']).optional(),
});

export const PerplexityChoiceSchema = z.object({
  message: PerplexityMessageSchema,
  finish_reason: z.string().optional(),
  index: z.number().optional(),
});

export const PerplexityResponseSchema = z.object({
  choices: z.array(PerplexityChoiceSchema).min(1, 'At least one choice required'),
  id: z.string().optional(),
  model: z.string().optional(),
  usage: z.any().optional(),
});

// ============= BREAKING NEWS SCHEMAS =============

export const NewsItemSchema = z.object({
  ticker: TickerSchema,
  headline: SanitizedString(500),
  summary: SanitizedString(1000),
  source: SanitizedString(200),
  url: z.string().url().max(2000).nullable().optional(),
  published_at: z.string().datetime(),
  sentiment_score: SentimentScoreSchema,
  relevance_score: z.number().min(0).max(1).default(0.8),
  metadata: z.record(z.any()).optional(),
});

export const NewsItemArraySchema = z.array(NewsItemSchema).max(100, 'Cannot insert more than 100 news items at once');

// ============= CRYPTO ON-CHAIN SCHEMAS =============

export const CryptoOnChainMetricsSchema = z.object({
  ticker: TickerSchema,
  asset_id: z.string().uuid().optional(),
  active_addresses: PositiveNumberSchema,
  active_addresses_change_pct: z.number().min(-100).max(1000),
  transaction_count: PositiveNumberSchema,
  transaction_count_change_pct: z.number().min(-100).max(1000),
  whale_transaction_count: z.number().int().min(0),
  large_transaction_volume: z.number().min(0),
  whale_signal: z.enum(['accumulating', 'distributing', 'neutral']),
  exchange_inflow: z.number().min(0),
  exchange_outflow: z.number().min(0),
  exchange_net_flow: z.number(),
  exchange_flow_signal: z.enum(['bullish_outflow', 'bearish_inflow', 'neutral']),
  supply_on_exchanges: z.number().nullable().optional(),
  supply_on_exchanges_pct: PercentageSchema.optional(),
  long_term_holder_supply_pct: PercentageSchema.optional(),
  hash_rate: z.number().nullable().optional(),
  hash_rate_change_pct: z.number().nullable().optional(),
  fear_greed_index: z.number().int().min(0).max(100),
  source: SanitizedString(200),
});

// ============= FOREX SENTIMENT SCHEMAS =============

export const ForexSentimentSchema = z.object({
  ticker: TickerSchema,
  asset_id: z.string().uuid().optional(),
  retail_long_pct: PercentageSchema,
  retail_short_pct: PercentageSchema,
  retail_sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  news_sentiment_score: SentimentScoreSchema,
  news_count: z.number().int().min(0),
  social_mentions: z.number().int().min(0),
  social_sentiment_score: SentimentScoreSchema,
  source: SanitizedString(200),
});

// ============= ETF FLOWS SCHEMAS =============

export const ETFFlowDataSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  ticker: TickerSchema,
  flow: z.number(),
});

export const ETFFlowArraySchema = z.array(ETFFlowDataSchema).max(10000, 'CSV too large');

// ============= VALIDATION HELPERS =============

/**
 * Safely parse and validate data, logging errors
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      const errorMsg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      console.error(`[${context}] Validation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error(`[${context}] Validation error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown validation error' };
  }
}

/**
 * Sanitize ticker symbol
 */
export function sanitizeTicker(ticker: string): string {
  return ticker.toUpperCase().replace(/[^A-Z0-9\/\-]/g, '').substring(0, 20);
}

/**
 * Validate sentiment score
 */
export function validateSentiment(score: number): number {
  if (isNaN(score) || !isFinite(score)) return 0;
  return Math.max(-1, Math.min(1, score));
}

/**
 * Validate percentage
 */
export function validatePercentage(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
