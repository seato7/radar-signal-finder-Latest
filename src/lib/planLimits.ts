export type PlanName = 'free' | 'starter' | 'pro' | 'premium' | 'enterprise' | 'admin';

export interface PlanLimits {
  active_signals: number;
  ai_messages_per_day: number;
  alerts: number;
  watchlist_slots: number;
  themes: number;
  asset_radar_classes: string[];
  show_scores: boolean;
  show_sentiment: boolean;
  analytics_access: boolean;
  full_dashboard: boolean;
  is_demo_only?: boolean;
  demo_tickers?: string[];
  can_view_signals_teaser?: boolean;
  theme_read_only?: boolean;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    active_signals: 0,
    ai_messages_per_day: 1,
    alerts: 0,
    watchlist_slots: 1,
    themes: 1,
    asset_radar_classes: ['stock', 'etf', 'forex'],
    show_scores: true,
    show_sentiment: false,
    analytics_access: false,
    full_dashboard: false,
    is_demo_only: true,
    demo_tickers: ['F', 'VTI', 'EUR/USD'],
    can_view_signals_teaser: true,
    theme_read_only: true,
  },
  starter: {
    active_signals: 1,
    ai_messages_per_day: 5,
    alerts: 1,
    watchlist_slots: 3,
    themes: 1,
    asset_radar_classes: ['stock'],
    show_scores: true,
    show_sentiment: false,
    analytics_access: false,
    full_dashboard: false,
  },
  pro: {
    active_signals: 3,
    ai_messages_per_day: 20,
    alerts: 5,
    watchlist_slots: 10,
    themes: 3,
    asset_radar_classes: ['stock', 'etf', 'forex'],
    show_scores: true,
    show_sentiment: false,
    analytics_access: false,
    full_dashboard: false,
  },
  premium: {
    active_signals: -1,
    ai_messages_per_day: -1,
    alerts: -1,
    watchlist_slots: -1,
    themes: -1,
    asset_radar_classes: ['stock', 'etf', 'forex', 'crypto', 'commodity'],
    show_scores: true,
    show_sentiment: true,
    analytics_access: true,
    full_dashboard: true,
  },
  enterprise: {
    active_signals: -1,
    ai_messages_per_day: -1,
    alerts: -1,
    watchlist_slots: -1,
    themes: -1,
    asset_radar_classes: ['stock', 'etf', 'forex', 'crypto', 'commodity'],
    show_scores: true,
    show_sentiment: true,
    analytics_access: true,
    full_dashboard: true,
  },
  admin: {
    active_signals: -1,
    ai_messages_per_day: -1,
    alerts: -1,
    watchlist_slots: -1,
    themes: -1,
    asset_radar_classes: ['stock', 'etf', 'forex', 'crypto', 'commodity'],
    show_scores: true,
    show_sentiment: true,
    analytics_access: true,
    full_dashboard: true,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as PlanName] ?? PLAN_LIMITS.free;
}

export function isUnlimited(value: number): boolean {
  return value === -1;
}

export function isPremiumOrAbove(plan: string): boolean {
  return ['premium', 'enterprise', 'admin'].includes(plan);
}

export function isProOrAbove(plan: string): boolean {
  return ['pro', 'premium', 'enterprise', 'admin'].includes(plan);
}

export function isStarterOrAbove(plan: string): boolean {
  return ['starter', 'pro', 'premium', 'enterprise', 'admin'].includes(plan);
}
