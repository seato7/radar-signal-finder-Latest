import type { Opportunity, Alert, BacktestResult, WatchlistItem, ScoringWeights } from '@/types/api';
import { supabase } from '@/integrations/supabase/client';

class ApiClient {
  private async invokeFunction<T>(functionName: string, body?: any): Promise<T> {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: body || {}
    });

    if (error) {
      throw new Error(`API Error: ${error.message}`);
    }

    return data as T;
  }

  // Health & Config
  async getHealthWeights(): Promise<ScoringWeights> {
    // Return default weights - this can be moved to edge function if needed
    return {
      theme_momentum: 0.3,
      signal_quality: 0.25,
      data_freshness: 0.2,
      signal_diversity: 0.15,
      magnitude: 0.1
    };
  }

  // Opportunities - These are computed from signals/themes
  async getOpportunities(params?: { limit?: number; theme?: string }): Promise<Opportunity[]> {
    return this.invokeFunction('get-assets', params);
  }

  async getOpportunity(id: string): Promise<Opportunity> {
    return this.invokeFunction('get-assets', { asset_id: id });
  }

  // Alerts
  async getAlerts(unreadOnly?: boolean): Promise<Alert[]> {
    return this.invokeFunction('get-alerts', { unread_only: unreadOnly });
  }

  async markAlertRead(id: string): Promise<void> {
    await this.invokeFunction('update-alert', { alert_id: id, status: 'read' });
  }

  // Backtest
  async runBacktest(params: { start_date: string; end_date: string }): Promise<BacktestResult> {
    const startDate = new Date(params.start_date);
    const endDate = new Date(params.end_date);
    const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return this.invokeFunction('run-backtest', { since_days: daysDiff });
  }

  // Watchlist
  async getWatchlist(): Promise<WatchlistItem[]> {
    return this.invokeFunction('get-watchlist', {});
  }

  async addToWatchlist(assetId: string, notes?: string): Promise<WatchlistItem> {
    // Use Supabase directly for simple CRUD
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ tickers: [assetId], user_id: (await supabase.auth.getUser()).data.user?.id })
      .select()
      .single();
    
    if (error) throw error;
    return data as any;
  }

  async removeFromWatchlist(id: string): Promise<void> {
    const { error } = await supabase.from('watchlist').delete().eq('id', id);
    if (error) throw error;
  }

  // Themes
  async getThemes(): Promise<Array<{ name: string; count: number }>> {
    return this.invokeFunction('get-themes', {});
  }

  // Export - Downloads are handled directly
  async exportData(format: 'csv' | 'parquet'): Promise<Blob> {
    // This would need a dedicated export function or direct query
    const { data: signals } = await supabase.from('signals').select('*');
    const csv = this.convertToCSV(signals || []);
    return new Blob([csv], { type: 'text/csv' });
  }

  private convertToCSV(data: any[]): string {
    if (!data.length) return '';
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    return [headers, ...rows].join('\n');
  }
}

export const api = new ApiClient();
