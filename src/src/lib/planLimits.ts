// Plan limits matching backend/services/payments.py
export interface PlanFeatures {
  max_bots: number;
  max_alerts: number;
  max_themes: number;
  paper_bots: number;
  live_eligible?: boolean;
  exports: string[];
  backtest_days: number;
}

export interface PlanLimits {
  [key: string]: PlanFeatures;
}

export const PLAN_LIMITS: PlanLimits = {
  free: {
    max_bots: 0,
    max_alerts: 1,
    max_themes: 1,
    paper_bots: 1,
    exports: ["csv"],
    backtest_days: 30
  },
  lite: {
    max_bots: 0,
    max_alerts: 10,
    max_themes: 2,
    paper_bots: 3,
    exports: ["csv"],
    backtest_days: 90
  },
  starter: {
    max_bots: 3,
    max_alerts: 25,
    max_themes: 3,
    paper_bots: -1,
    live_eligible: true,
    exports: ["csv", "parquet"],
    backtest_days: -1
  },
  pro: {
    max_bots: 10,
    max_alerts: -1,
    max_themes: -1,
    paper_bots: -1,
    live_eligible: true,
    exports: ["csv", "parquet"],
    backtest_days: -1
  },
  premium: {
    max_bots: -1,
    max_alerts: -1,
    max_themes: -1,
    paper_bots: -1,
    live_eligible: true,
    exports: ["csv", "parquet"],
    backtest_days: -1
  },
  enterprise: {
    max_bots: -1,
    max_alerts: -1,
    max_themes: -1,
    paper_bots: -1,
    live_eligible: true,
    exports: ["csv", "parquet"],
    backtest_days: -1
  },
  admin: {
    max_bots: -1,
    max_alerts: -1,
    max_themes: -1,
    paper_bots: -1,
    live_eligible: true,
    exports: ["csv", "parquet"],
    backtest_days: -1
  }
};

// Helper function to check if user can perform an action
export const checkPlanLimit = (
  userPlan: string,
  feature: keyof PlanFeatures,
  currentCount: number
): boolean => {
  const plan = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;
  const limit = plan[feature] as number;
  
  if (limit === -1) return true; // unlimited
  return currentCount < limit;
};

// Helper to get plan limit value
export const getPlanLimit = (
  userPlan: string,
  feature: keyof PlanFeatures
): number => {
  const plan = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;
  return plan[feature] as number;
};
