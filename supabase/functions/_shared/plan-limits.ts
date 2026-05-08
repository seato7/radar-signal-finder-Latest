// Server-side mirror of src/lib/planLimits.ts. Used by edge functions
// that create user-scoped resources (e.g. manage-alert-settings)
// for pre-flight 403 responses with current/limit fields the frontend
// can render upgrade CTAs from.
//
// The DB triggers in 20260506000001_plan_limit_triggers.sql are the
// actual security boundary. These constants only inform the
// function-level early-return UX; if you change a value here, also
// change the SQL helper (_plan_alert_limit, _plan_watchlist_slot_limit)
// AND src/lib/planLimits.ts, otherwise the three sources will drift.

export type PlanName =
  | 'free'
  | 'starter'
  | 'pro'
  | 'premium'
  | 'enterprise'
  | 'admin';

export interface PlanLimits {
  active_signals: number;
  ai_messages_per_day: number;
  alerts: number;
  watchlist_slots: number;
  themes: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free:       { active_signals: 0,  ai_messages_per_day: 1,  alerts: 0,  watchlist_slots: 1,  themes: 1 },
  starter:    { active_signals: 1,  ai_messages_per_day: 5,  alerts: 1,  watchlist_slots: 3,  themes: 1 },
  pro:        { active_signals: 3,  ai_messages_per_day: 20, alerts: 5,  watchlist_slots: 10, themes: 3 },
  premium:    { active_signals: -1, ai_messages_per_day: -1, alerts: -1, watchlist_slots: -1, themes: -1 },
  enterprise: { active_signals: -1, ai_messages_per_day: -1, alerts: -1, watchlist_slots: -1, themes: -1 },
  admin:      { active_signals: -1, ai_messages_per_day: -1, alerts: -1, watchlist_slots: -1, themes: -1 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as PlanName] ?? PLAN_LIMITS.free;
}

export function isUnlimited(value: number): boolean {
  return value === -1;
}
