import { z } from 'zod';

// Auth validation schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Bot creation validation
export const botConfigSchema = z.object({
  name: z.string().min(1, 'Bot name is required').max(100, 'Name too long'),
  strategy: z.enum(['grid', 'momentum', 'dca', 'meanrev']),
  tickers: z.array(z.string()).min(1, 'Select at least one ticker'),
  params: z.record(z.string(), z.any()),
  risk_policy: z.object({
    max_drawdown_pct: z.number().min(0).max(100),
    max_position_value: z.number().min(0),
    max_daily_trades: z.number().int().min(1),
    slippage_bps: z.number().int().min(0),
  }).optional(),
});

// Alert threshold validation
export const alertThresholdSchema = z.object({
  score_threshold: z.number().min(0).max(10),
  min_signals: z.number().int().min(1),
});

// Watchlist validation
export const watchlistSchema = z.object({
  ticker: z.string().min(1, 'Ticker is required').max(10),
  notes: z.string().max(500, 'Notes too long').optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type BotConfigInput = z.infer<typeof botConfigSchema>;
export type AlertThresholdInput = z.infer<typeof alertThresholdSchema>;
export type WatchlistInput = z.infer<typeof watchlistSchema>;
