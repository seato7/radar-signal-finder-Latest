export interface Citation {
  source: string;
  url?: string;
  timestamp: string;
}

export interface Opportunity {
  id: string;
  asset_id: string;
  asset_name: string;
  score: number;
  signal_strength: number;
  themes: string[];
  citations: Citation[];
  created_at: string;
  metadata: Record<string, any>;
}

export interface Alert {
  id: string;
  opportunity_id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  created_at: string;
  read: boolean;
}

export interface BacktestResult {
  period: string;
  total_opportunities: number;
  hit_rate: number;
  avg_return: number;
  best_themes: string[];
}

export interface WatchlistItem {
  id: string;
  asset_id: string;
  asset_name: string;
  added_at: string;
  notes?: string;
}

export interface ScoringWeights {
  momentum: number;
  sentiment: number;
  volume: number;
  decay_factor: number;
}
