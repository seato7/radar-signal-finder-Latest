import type { Opportunity, Alert, BacktestResult, WatchlistItem, ScoringWeights } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiClient {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Health & Config
  async getHealthWeights(): Promise<ScoringWeights> {
    return this.fetch('/healthz/weights');
  }

  // Opportunities
  async getOpportunities(params?: { limit?: number; theme?: string }): Promise<Opportunity[]> {
    const query = new URLSearchParams(params as any).toString();
    return this.fetch(`/opportunities${query ? `?${query}` : ''}`);
  }

  async getOpportunity(id: string): Promise<Opportunity> {
    return this.fetch(`/opportunities/${id}`);
  }

  // Alerts
  async getAlerts(unreadOnly?: boolean): Promise<Alert[]> {
    return this.fetch(`/alerts${unreadOnly ? '?unread=true' : ''}`);
  }

  async markAlertRead(id: string): Promise<void> {
    await this.fetch(`/alerts/${id}/read`, { method: 'POST' });
  }

  // Backtest
  async runBacktest(params: { start_date: string; end_date: string }): Promise<BacktestResult> {
    return this.fetch('/backtest', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Watchlist
  async getWatchlist(): Promise<WatchlistItem[]> {
    return this.fetch('/watchlist');
  }

  async addToWatchlist(assetId: string, notes?: string): Promise<WatchlistItem> {
    return this.fetch('/watchlist', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetId, notes }),
    });
  }

  async removeFromWatchlist(id: string): Promise<void> {
    await this.fetch(`/watchlist/${id}`, { method: 'DELETE' });
  }

  // Themes
  async getThemes(): Promise<Array<{ name: string; count: number }>> {
    return this.fetch('/themes');
  }

  // Export
  async exportData(format: 'csv' | 'parquet'): Promise<Blob> {
    const response = await fetch(`${API_BASE}/export?format=${format}`);
    return response.blob();
  }
}

export const api = new ApiClient();
