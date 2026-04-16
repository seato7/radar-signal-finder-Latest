export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      advanced_technicals: {
        Row: {
          adx: number | null
          asset_class: string
          asset_id: string | null
          breakout_signal: string | null
          created_at: string | null
          current_price: number | null
          fib_0: number | null
          fib_1000: number | null
          fib_236: number | null
          fib_382: number | null
          fib_500: number | null
          fib_618: number | null
          fib_786: number | null
          id: string
          last_updated_at: string | null
          metadata: Json | null
          obv: number | null
          price_vs_vwap_pct: number | null
          resistance_1: number | null
          resistance_2: number | null
          resistance_3: number | null
          stochastic_d: number | null
          stochastic_k: number | null
          stochastic_signal: string | null
          support_1: number | null
          support_2: number | null
          support_3: number | null
          ticker: string
          timestamp: string
          trend_strength: string | null
          volume_24h: number | null
          volume_change_pct: number | null
          vwap: number | null
        }
        Insert: {
          adx?: number | null
          asset_class: string
          asset_id?: string | null
          breakout_signal?: string | null
          created_at?: string | null
          current_price?: number | null
          fib_0?: number | null
          fib_1000?: number | null
          fib_236?: number | null
          fib_382?: number | null
          fib_500?: number | null
          fib_618?: number | null
          fib_786?: number | null
          id?: string
          last_updated_at?: string | null
          metadata?: Json | null
          obv?: number | null
          price_vs_vwap_pct?: number | null
          resistance_1?: number | null
          resistance_2?: number | null
          resistance_3?: number | null
          stochastic_d?: number | null
          stochastic_k?: number | null
          stochastic_signal?: string | null
          support_1?: number | null
          support_2?: number | null
          support_3?: number | null
          ticker: string
          timestamp?: string
          trend_strength?: string | null
          volume_24h?: number | null
          volume_change_pct?: number | null
          vwap?: number | null
        }
        Update: {
          adx?: number | null
          asset_class?: string
          asset_id?: string | null
          breakout_signal?: string | null
          created_at?: string | null
          current_price?: number | null
          fib_0?: number | null
          fib_1000?: number | null
          fib_236?: number | null
          fib_382?: number | null
          fib_500?: number | null
          fib_618?: number | null
          fib_786?: number | null
          id?: string
          last_updated_at?: string | null
          metadata?: Json | null
          obv?: number | null
          price_vs_vwap_pct?: number | null
          resistance_1?: number | null
          resistance_2?: number | null
          resistance_3?: number | null
          stochastic_d?: number | null
          stochastic_k?: number | null
          stochastic_signal?: string | null
          support_1?: number | null
          support_2?: number | null
          support_3?: number | null
          ticker?: string
          timestamp?: string
          trend_strength?: string | null
          volume_24h?: number | null
          volume_change_pct?: number | null
          vwap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "advanced_technicals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "advanced_technicals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_technicals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_research_reports: {
        Row: {
          asset_class: string
          asset_id: string | null
          confidence_score: number | null
          created_at: string | null
          data_sources: string[] | null
          executive_summary: string
          expires_at: string | null
          fundamental_analysis: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          key_findings: Json | null
          metadata: Json | null
          recommendation: string | null
          report_type: string
          risk_assessment: string | null
          sentiment_analysis: string | null
          signal_count: number | null
          stop_loss: number | null
          target_price: number | null
          technical_analysis: string | null
          ticker: string
          time_horizon: string | null
        }
        Insert: {
          asset_class: string
          asset_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          data_sources?: string[] | null
          executive_summary: string
          expires_at?: string | null
          fundamental_analysis?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          key_findings?: Json | null
          metadata?: Json | null
          recommendation?: string | null
          report_type: string
          risk_assessment?: string | null
          sentiment_analysis?: string | null
          signal_count?: number | null
          stop_loss?: number | null
          target_price?: number | null
          technical_analysis?: string | null
          ticker: string
          time_horizon?: string | null
        }
        Update: {
          asset_class?: string
          asset_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          data_sources?: string[] | null
          executive_summary?: string
          expires_at?: string | null
          fundamental_analysis?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          key_findings?: Json | null
          metadata?: Json | null
          recommendation?: string | null
          report_type?: string
          risk_assessment?: string | null
          sentiment_analysis?: string | null
          signal_count?: number | null
          stop_loss?: number | null
          target_price?: number | null
          technical_analysis?: string | null
          ticker?: string
          time_horizon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_research_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "ai_research_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_research_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_scores: {
        Row: {
          ai_score: number | null
          asset_id: string | null
          confidence: number | null
          created_at: string | null
          direction: string | null
          formula_score: number | null
          hybrid_score: number | null
          id: string
          key_signals: Json | null
          model_version: string | null
          reasoning: string | null
          scored_at: string | null
          ticker: string
        }
        Insert: {
          ai_score?: number | null
          asset_id?: string | null
          confidence?: number | null
          created_at?: string | null
          direction?: string | null
          formula_score?: number | null
          hybrid_score?: number | null
          id?: string
          key_signals?: Json | null
          model_version?: string | null
          reasoning?: string | null
          scored_at?: string | null
          ticker: string
        }
        Update: {
          ai_score?: number | null
          asset_id?: string | null
          confidence?: number | null
          created_at?: string | null
          direction?: string | null
          formula_score?: number | null
          hybrid_score?: number | null
          id?: string
          key_signals?: Json | null
          model_version?: string | null
          reasoning?: string | null
          scored_at?: string | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_scores_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "ai_scores_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_scores_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_history: {
        Row: {
          alert_type: string
          created_at: string | null
          function_name: string
          id: string
          message: string
          metadata: Json | null
          severity: string
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          function_name: string
          id?: string
          message: string
          metadata?: Json | null
          severity: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          function_name?: string
          id?: string
          message?: string
          metadata?: Json | null
          severity?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string | null
          dont_miss: Json | null
          id: string
          positives: string[] | null
          score: number
          status: Database["public"]["Enums"]["alert_status"] | null
          theme_id: string
          theme_name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dont_miss?: Json | null
          id?: string
          positives?: string[] | null
          score: number
          status?: Database["public"]["Enums"]["alert_status"] | null
          theme_id: string
          theme_name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          dont_miss?: Json | null
          id?: string
          positives?: string[] | null
          score?: number
          status?: Database["public"]["Enums"]["alert_status"] | null
          theme_id?: string
          theme_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "theme_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      api_costs: {
        Row: {
          api_name: string
          cost_per_call: number | null
          daily_limit: number | null
          is_paid: boolean | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          api_name: string
          cost_per_call?: number | null
          daily_limit?: number | null
          is_paid?: boolean | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          api_name?: string
          cost_per_call?: number | null
          daily_limit?: number | null
          is_paid?: boolean | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          api_name: string
          created_at: string
          endpoint: string | null
          error_message: string | null
          function_name: string
          id: string
          response_time_ms: number | null
          status: string
        }
        Insert: {
          api_name: string
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          function_name: string
          id?: string
          response_time_ms?: number | null
          status: string
        }
        Update: {
          api_name?: string
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          response_time_ms?: number | null
          status?: string
        }
        Relationships: []
      }
      asset_prediction_results: {
        Row: {
          computed_at: string
          hit: boolean
          horizon: string
          id: string
          prediction_id: string
          realized_return: number
        }
        Insert: {
          computed_at?: string
          hit?: boolean
          horizon?: string
          id?: string
          prediction_id: string
          realized_return?: number
        }
        Update: {
          computed_at?: string
          hit?: boolean
          horizon?: string
          id?: string
          prediction_id?: string
          realized_return?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_prediction_results_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "asset_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_predictions: {
        Row: {
          asset_id: string
          computed_at: string
          confidence_label: string
          confidence_score: number
          expected_return: number
          feature_snapshot: Json
          id: string
          model_version: string
          rank: number
          snapshot_date: string
          ticker: string
          top_n: number | null
        }
        Insert: {
          asset_id: string
          computed_at?: string
          confidence_label: string
          confidence_score: number
          expected_return: number
          feature_snapshot?: Json
          id?: string
          model_version: string
          rank: number
          snapshot_date: string
          ticker: string
          top_n?: number | null
        }
        Update: {
          asset_id?: string
          computed_at?: string
          confidence_label?: string
          confidence_score?: number
          expected_return?: number
          feature_snapshot?: Json
          id?: string
          model_version?: string
          rank?: number
          snapshot_date?: string
          ticker?: string
          top_n?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_predictions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "asset_predictions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_predictions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_score_snapshots: {
        Row: {
          asset_name: string | null
          computed_score: number | null
          created_at: string | null
          id: string
          rank: number | null
          snapshot_date: string
          ticker: string
        }
        Insert: {
          asset_name?: string | null
          computed_score?: number | null
          created_at?: string | null
          id?: string
          rank?: number | null
          snapshot_date: string
          ticker: string
        }
        Update: {
          asset_name?: string | null
          computed_score?: number | null
          created_at?: string | null
          id?: string
          rank?: number | null
          snapshot_date?: string
          ticker?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          ai_score: number | null
          asset_class: string | null
          base_currency: string | null
          computed_score: number | null
          confidence_label: string | null
          confidence_score: number | null
          contract_size: number | null
          created_at: string | null
          days_stale: number | null
          effective_score: number | null
          exchange: string
          expected_return: number | null
          hybrid_score: number | null
          id: string
          last_price_date: string | null
          metadata: Json | null
          model_version: string | null
          name: string
          pip_value: number | null
          price_points_30d: number | null
          price_status: string | null
          quote_currency: string | null
          rank_status: string | null
          score_computed_at: string | null
          score_explanation: Json | null
          sector: string | null
          sector_percentile_rank: number | null
          spread_typical: number | null
          ticker: string
        }
        Insert: {
          ai_score?: number | null
          asset_class?: string | null
          base_currency?: string | null
          computed_score?: number | null
          confidence_label?: string | null
          confidence_score?: number | null
          contract_size?: number | null
          created_at?: string | null
          days_stale?: number | null
          effective_score?: number | null
          exchange: string
          expected_return?: number | null
          hybrid_score?: number | null
          id?: string
          last_price_date?: string | null
          metadata?: Json | null
          model_version?: string | null
          name: string
          pip_value?: number | null
          price_points_30d?: number | null
          price_status?: string | null
          quote_currency?: string | null
          rank_status?: string | null
          score_computed_at?: string | null
          score_explanation?: Json | null
          sector?: string | null
          sector_percentile_rank?: number | null
          spread_typical?: number | null
          ticker: string
        }
        Update: {
          ai_score?: number | null
          asset_class?: string | null
          base_currency?: string | null
          computed_score?: number | null
          confidence_label?: string | null
          confidence_score?: number | null
          contract_size?: number | null
          created_at?: string | null
          days_stale?: number | null
          effective_score?: number | null
          exchange?: string
          expected_return?: number | null
          hybrid_score?: number | null
          id?: string
          last_price_date?: string | null
          metadata?: Json | null
          model_version?: string | null
          name?: string
          pip_value?: number | null
          price_points_30d?: number | null
          price_status?: string | null
          quote_currency?: string | null
          rank_status?: string | null
          score_computed_at?: string | null
          score_explanation?: Json | null
          sector?: string | null
          sector_percentile_rank?: number | null
          spread_typical?: number | null
          ticker?: string
        }
        Relationships: []
      }
      backtest_analyses: {
        Row: {
          backtest_result_snapshot: Json | null
          generated_at: string | null
          id: string
          insights: string
          model: string | null
          strategy_name: string | null
        }
        Insert: {
          backtest_result_snapshot?: Json | null
          generated_at?: string | null
          id?: string
          insights: string
          model?: string | null
          strategy_name?: string | null
        }
        Update: {
          backtest_result_snapshot?: Json | null
          generated_at?: string | null
          id?: string
          insights?: string
          model?: string | null
          strategy_name?: string | null
        }
        Relationships: []
      }
      backtest_diagnostics: {
        Row: {
          count: number
          excluded_reason: string
          sample_tickers: string[]
          snapshot_date: string
        }
        Insert: {
          count: number
          excluded_reason: string
          sample_tickers?: string[]
          snapshot_date: string
        }
        Update: {
          count?: number
          excluded_reason?: string
          sample_tickers?: string[]
          snapshot_date?: string
        }
        Relationships: []
      }
      bot_logs: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json | null
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          level: string
          message: string
          metadata?: Json | null
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_orders: {
        Row: {
          bot_id: string
          broker_order_id: string | null
          created_at: string
          id: string
          mode: string
          price: number
          qty: number
          reason: string | null
          side: string
          slippage_applied: number | null
          status: string | null
          ticker: string
        }
        Insert: {
          bot_id: string
          broker_order_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          price: number
          qty: number
          reason?: string | null
          side: string
          slippage_applied?: number | null
          status?: string | null
          ticker: string
        }
        Update: {
          bot_id?: string
          broker_order_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          price?: number
          qty?: number
          reason?: string | null
          side?: string
          slippage_applied?: number | null
          status?: string | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_orders_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_positions: {
        Row: {
          avg_price: number
          bot_id: string
          created_at: string
          id: string
          mode: string
          qty: number
          realized_pnl: number | null
          ticker: string
          unrealized_pnl: number | null
          updated_at: string
        }
        Insert: {
          avg_price?: number
          bot_id: string
          created_at?: string
          id?: string
          mode?: string
          qty?: number
          realized_pnl?: number | null
          ticker: string
          unrealized_pnl?: number | null
          updated_at?: string
        }
        Update: {
          avg_price?: number
          bot_id?: string
          created_at?: string
          id?: string
          mode?: string
          qty?: number
          realized_pnl?: number | null
          ticker?: string
          unrealized_pnl?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_positions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          created_at: string
          id: string
          mode: string
          name: string
          params: Json
          risk_policy: Json
          status: string
          strategy: string
          theme_subscriptions: Json | null
          tickers: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          name: string
          params?: Json
          risk_policy?: Json
          status?: string
          strategy: string
          theme_subscriptions?: Json | null
          tickers?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          name?: string
          params?: Json
          risk_policy?: Json
          status?: string
          strategy?: string
          theme_subscriptions?: Json | null
          tickers?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      breaking_news: {
        Row: {
          created_at: string | null
          headline: string
          id: string
          metadata: Json | null
          published_at: string | null
          relevance_score: number | null
          sentiment_score: number | null
          source: string | null
          summary: string | null
          ticker: string
          url: string | null
        }
        Insert: {
          created_at?: string | null
          headline: string
          id?: string
          metadata?: Json | null
          published_at?: string | null
          relevance_score?: number | null
          sentiment_score?: number | null
          source?: string | null
          summary?: string | null
          ticker: string
          url?: string | null
        }
        Update: {
          created_at?: string | null
          headline?: string
          id?: string
          metadata?: Json | null
          published_at?: string | null
          relevance_score?: number | null
          sentiment_score?: number | null
          source?: string | null
          summary?: string | null
          ticker?: string
          url?: string | null
        }
        Relationships: []
      }
      broker_key_rotation_logs: {
        Row: {
          broker_key_id: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_encryption_version: string
          old_encryption_version: string
          rotated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          broker_key_id: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_encryption_version: string
          old_encryption_version: string
          rotated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          broker_key_id?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_encryption_version?: string
          old_encryption_version?: string
          rotated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_key_rotation_logs_broker_key_id_fkey"
            columns: ["broker_key_id"]
            isOneToOne: false
            referencedRelation: "broker_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_keys: {
        Row: {
          account_type: string | null
          api_key_encrypted: string
          broker_name: string | null
          created_at: string
          encryption_version: string | null
          exchange: string
          id: string
          paper_mode: boolean
          secret_key_encrypted: string
          supported_assets: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string | null
          api_key_encrypted: string
          broker_name?: string | null
          created_at?: string
          encryption_version?: string | null
          exchange: string
          id?: string
          paper_mode?: boolean
          secret_key_encrypted: string
          supported_assets?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string | null
          api_key_encrypted?: string
          broker_name?: string | null
          created_at?: string
          encryption_version?: string | null
          exchange?: string
          id?: string
          paper_mode?: boolean
          secret_key_encrypted?: string
          supported_assets?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      circuit_breaker_status: {
        Row: {
          consecutive_failures: number
          consecutive_slow_calls: number
          created_at: string
          function_name: string
          is_open: boolean
          last_failure_at: string | null
          last_success_at: string | null
          opened_at: string | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          consecutive_slow_calls?: number
          created_at?: string
          function_name: string
          is_open?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          consecutive_slow_calls?: number
          created_at?: string
          function_name?: string
          is_open?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_fundamentals: {
        Row: {
          asset_id: string | null
          beta: number | null
          created_at: string
          eps_growth_5y: number | null
          fetched_at: string
          id: string
          net_margin: number | null
          revenue_growth_yoy: number | null
          roa: number | null
          roe: number | null
          ticker: string
        }
        Insert: {
          asset_id?: string | null
          beta?: number | null
          created_at?: string
          eps_growth_5y?: number | null
          fetched_at?: string
          id?: string
          net_margin?: number | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          ticker: string
        }
        Update: {
          asset_id?: string | null
          beta?: number | null
          created_at?: string
          eps_growth_5y?: number | null
          fetched_at?: string
          id?: string
          net_margin?: number | null
          revenue_growth_yoy?: number | null
          roa?: number | null
          roe?: number | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_fundamentals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "company_fundamentals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_fundamentals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      congressional_trades: {
        Row: {
          amount_max: number | null
          amount_min: number | null
          chamber: string | null
          created_at: string | null
          filed_date: string
          id: string
          metadata: Json | null
          party: string | null
          representative: string
          ticker: string
          transaction_date: string
          transaction_type: string | null
        }
        Insert: {
          amount_max?: number | null
          amount_min?: number | null
          chamber?: string | null
          created_at?: string | null
          filed_date: string
          id?: string
          metadata?: Json | null
          party?: string | null
          representative: string
          ticker: string
          transaction_date: string
          transaction_type?: string | null
        }
        Update: {
          amount_max?: number | null
          amount_min?: number | null
          chamber?: string | null
          created_at?: string | null
          filed_date?: string
          id?: string
          metadata?: Json | null
          party?: string | null
          representative?: string
          ticker?: string
          transaction_date?: string
          transaction_type?: string | null
        }
        Relationships: []
      }
      cot_reports: {
        Row: {
          asset_id: string | null
          commercial_long: number | null
          commercial_net: number | null
          commercial_short: number | null
          created_at: string | null
          id: string
          metadata: Json | null
          net_position_change: number | null
          noncommercial_long: number | null
          noncommercial_net: number | null
          noncommercial_short: number | null
          nonreportable_long: number | null
          nonreportable_net: number | null
          nonreportable_short: number | null
          report_date: string
          sentiment: string | null
          ticker: string
        }
        Insert: {
          asset_id?: string | null
          commercial_long?: number | null
          commercial_net?: number | null
          commercial_short?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          net_position_change?: number | null
          noncommercial_long?: number | null
          noncommercial_net?: number | null
          noncommercial_short?: number | null
          nonreportable_long?: number | null
          nonreportable_net?: number | null
          nonreportable_short?: number | null
          report_date: string
          sentiment?: string | null
          ticker: string
        }
        Update: {
          asset_id?: string | null
          commercial_long?: number | null
          commercial_net?: number | null
          commercial_short?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          net_position_change?: number | null
          noncommercial_long?: number | null
          noncommercial_net?: number | null
          noncommercial_short?: number | null
          nonreportable_long?: number | null
          nonreportable_net?: number | null
          nonreportable_short?: number | null
          report_date?: string
          sentiment?: string | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "cot_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "cot_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cot_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_onchain_metrics: {
        Row: {
          active_addresses: number | null
          active_addresses_change_pct: number | null
          asset_id: string | null
          created_at: string | null
          exchange_flow_signal: string | null
          exchange_inflow: number | null
          exchange_net_flow: number | null
          exchange_outflow: number | null
          fear_greed_index: number | null
          hash_rate: number | null
          hash_rate_change_pct: number | null
          hodl_waves: Json | null
          id: string
          large_transaction_volume: number | null
          last_updated_at: string | null
          long_term_holder_supply_pct: number | null
          metadata: Json | null
          mvrv_ratio: number | null
          nvt_ratio: number | null
          source: string | null
          supply_on_exchanges: number | null
          supply_on_exchanges_pct: number | null
          ticker: string
          timestamp: string
          transaction_count: number | null
          transaction_count_change_pct: number | null
          whale_signal: string | null
          whale_transaction_count: number | null
        }
        Insert: {
          active_addresses?: number | null
          active_addresses_change_pct?: number | null
          asset_id?: string | null
          created_at?: string | null
          exchange_flow_signal?: string | null
          exchange_inflow?: number | null
          exchange_net_flow?: number | null
          exchange_outflow?: number | null
          fear_greed_index?: number | null
          hash_rate?: number | null
          hash_rate_change_pct?: number | null
          hodl_waves?: Json | null
          id?: string
          large_transaction_volume?: number | null
          last_updated_at?: string | null
          long_term_holder_supply_pct?: number | null
          metadata?: Json | null
          mvrv_ratio?: number | null
          nvt_ratio?: number | null
          source?: string | null
          supply_on_exchanges?: number | null
          supply_on_exchanges_pct?: number | null
          ticker: string
          timestamp?: string
          transaction_count?: number | null
          transaction_count_change_pct?: number | null
          whale_signal?: string | null
          whale_transaction_count?: number | null
        }
        Update: {
          active_addresses?: number | null
          active_addresses_change_pct?: number | null
          asset_id?: string | null
          created_at?: string | null
          exchange_flow_signal?: string | null
          exchange_inflow?: number | null
          exchange_net_flow?: number | null
          exchange_outflow?: number | null
          fear_greed_index?: number | null
          hash_rate?: number | null
          hash_rate_change_pct?: number | null
          hodl_waves?: Json | null
          id?: string
          large_transaction_volume?: number | null
          last_updated_at?: string | null
          long_term_holder_supply_pct?: number | null
          metadata?: Json | null
          mvrv_ratio?: number | null
          nvt_ratio?: number | null
          source?: string | null
          supply_on_exchanges?: number | null
          supply_on_exchanges_pct?: number | null
          ticker?: string
          timestamp?: string
          transaction_count?: number | null
          transaction_count_change_pct?: number | null
          whale_signal?: string | null
          whale_transaction_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crypto_onchain_metrics_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "crypto_onchain_metrics_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_onchain_metrics_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      cusip_mappings: {
        Row: {
          company_name: string | null
          created_at: string | null
          cusip: string
          source: string
          ticker: string | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          cusip: string
          source?: string
          ticker?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          cusip?: string
          source?: string
          ticker?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      dark_pool_activity: {
        Row: {
          asset_id: string | null
          created_at: string | null
          dark_pool_percentage: number | null
          dark_pool_volume: number | null
          dp_to_lit_ratio: number | null
          id: string
          metadata: Json | null
          price_at_trade: number | null
          price_impact_estimate: number | null
          signal_strength: string | null
          signal_type: string | null
          source: string | null
          ticker: string
          total_volume: number | null
          trade_date: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          dark_pool_percentage?: number | null
          dark_pool_volume?: number | null
          dp_to_lit_ratio?: number | null
          id?: string
          metadata?: Json | null
          price_at_trade?: number | null
          price_impact_estimate?: number | null
          signal_strength?: string | null
          signal_type?: string | null
          source?: string | null
          ticker: string
          total_volume?: number | null
          trade_date: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          dark_pool_percentage?: number | null
          dark_pool_volume?: number | null
          dp_to_lit_ratio?: number | null
          id?: string
          metadata?: Json | null
          price_at_trade?: number | null
          price_impact_estimate?: number | null
          signal_strength?: string | null
          signal_type?: string | null
          source?: string | null
          ticker?: string
          total_volume?: number | null
          trade_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "dark_pool_activity_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "dark_pool_activity_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dark_pool_activity_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings_sentiment: {
        Row: {
          created_at: string | null
          earnings_date: string | null
          earnings_surprise: number | null
          id: string
          metadata: Json | null
          quarter: string | null
          revenue_surprise: number | null
          sentiment_score: number | null
          ticker: string
        }
        Insert: {
          created_at?: string | null
          earnings_date?: string | null
          earnings_surprise?: number | null
          id?: string
          metadata?: Json | null
          quarter?: string | null
          revenue_surprise?: number | null
          sentiment_score?: number | null
          ticker: string
        }
        Update: {
          created_at?: string | null
          earnings_date?: string | null
          earnings_surprise?: number | null
          id?: string
          metadata?: Json | null
          quarter?: string | null
          revenue_surprise?: number | null
          sentiment_score?: number | null
          ticker?: string
        }
        Relationships: []
      }
      economic_indicators: {
        Row: {
          country: string
          created_at: string | null
          forecast_value: number | null
          id: string
          impact: string | null
          indicator_type: string
          last_updated_at: string | null
          metadata: Json | null
          previous_value: number | null
          release_date: string
          series_id: string | null
          source: string | null
          value: number
        }
        Insert: {
          country: string
          created_at?: string | null
          forecast_value?: number | null
          id?: string
          impact?: string | null
          indicator_type: string
          last_updated_at?: string | null
          metadata?: Json | null
          previous_value?: number | null
          release_date: string
          series_id?: string | null
          source?: string | null
          value: number
        }
        Update: {
          country?: string
          created_at?: string | null
          forecast_value?: number | null
          id?: string
          impact?: string | null
          indicator_type?: string
          last_updated_at?: string | null
          metadata?: Json | null
          previous_value?: number | null
          release_date?: string
          series_id?: string | null
          source?: string | null
          value?: number
        }
        Relationships: []
      }
      eps_revisions: {
        Row: {
          asset_id: string | null
          created_at: string
          current_estimate: number | null
          fetched_at: string
          id: string
          period: string
          prior_estimate: number | null
          revision_direction: string | null
          revision_pct: number | null
          ticker: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          current_estimate?: number | null
          fetched_at?: string
          id?: string
          period: string
          prior_estimate?: number | null
          revision_direction?: string | null
          revision_pct?: number | null
          ticker: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          current_estimate?: number | null
          fetched_at?: string
          id?: string
          period?: string
          prior_estimate?: number | null
          revision_direction?: string | null
          revision_pct?: number | null
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "eps_revisions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "eps_revisions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eps_revisions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      etf_flows: {
        Row: {
          asset_id: string | null
          aum: number | null
          created_at: string | null
          flow_date: string
          id: string
          inflow: number | null
          metadata: Json | null
          net_flow: number | null
          outflow: number | null
          ticker: string
          volume: number | null
        }
        Insert: {
          asset_id?: string | null
          aum?: number | null
          created_at?: string | null
          flow_date: string
          id?: string
          inflow?: number | null
          metadata?: Json | null
          net_flow?: number | null
          outflow?: number | null
          ticker: string
          volume?: number | null
        }
        Update: {
          asset_id?: string | null
          aum?: number | null
          created_at?: string | null
          flow_date?: string
          id?: string
          inflow?: number | null
          metadata?: Json | null
          net_flow?: number | null
          outflow?: number | null
          ticker?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "etf_flows_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "etf_flows_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etf_flows_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      forex_sentiment: {
        Row: {
          asset_id: string | null
          created_at: string | null
          id: string
          last_updated_at: string | null
          metadata: Json | null
          news_count: number | null
          news_sentiment_score: number | null
          retail_long_pct: number | null
          retail_sentiment: string | null
          retail_short_pct: number | null
          social_mentions: number | null
          social_sentiment_score: number | null
          source: string | null
          ticker: string
          timestamp: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          id?: string
          last_updated_at?: string | null
          metadata?: Json | null
          news_count?: number | null
          news_sentiment_score?: number | null
          retail_long_pct?: number | null
          retail_sentiment?: string | null
          retail_short_pct?: number | null
          social_mentions?: number | null
          social_sentiment_score?: number | null
          source?: string | null
          ticker: string
          timestamp?: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          id?: string
          last_updated_at?: string | null
          metadata?: Json | null
          news_count?: number | null
          news_sentiment_score?: number | null
          retail_long_pct?: number | null
          retail_sentiment?: string | null
          retail_short_pct?: number | null
          social_mentions?: number | null
          social_sentiment_score?: number | null
          source?: string | null
          ticker?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "forex_sentiment_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "forex_sentiment_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forex_sentiment_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      forex_technicals: {
        Row: {
          asset_id: string | null
          atr_14: number | null
          bollinger_lower: number | null
          bollinger_middle: number | null
          bollinger_upper: number | null
          close_price: number | null
          created_at: string | null
          ema_200: number | null
          ema_50: number | null
          id: string
          ma_crossover: string | null
          macd_crossover: string | null
          macd_histogram: number | null
          macd_line: number | null
          macd_signal: number | null
          metadata: Json | null
          rsi_14: number | null
          rsi_signal: string | null
          sma_200: number | null
          sma_50: number | null
          ticker: string
          timestamp: string
        }
        Insert: {
          asset_id?: string | null
          atr_14?: number | null
          bollinger_lower?: number | null
          bollinger_middle?: number | null
          bollinger_upper?: number | null
          close_price?: number | null
          created_at?: string | null
          ema_200?: number | null
          ema_50?: number | null
          id?: string
          ma_crossover?: string | null
          macd_crossover?: string | null
          macd_histogram?: number | null
          macd_line?: number | null
          macd_signal?: number | null
          metadata?: Json | null
          rsi_14?: number | null
          rsi_signal?: string | null
          sma_200?: number | null
          sma_50?: number | null
          ticker: string
          timestamp?: string
        }
        Update: {
          asset_id?: string | null
          atr_14?: number | null
          bollinger_lower?: number | null
          bollinger_middle?: number | null
          bollinger_upper?: number | null
          close_price?: number | null
          created_at?: string | null
          ema_200?: number | null
          ema_50?: number | null
          id?: string
          ma_crossover?: string | null
          macd_crossover?: string | null
          macd_histogram?: number | null
          macd_line?: number | null
          macd_signal?: number | null
          metadata?: Json | null
          rsi_14?: number | null
          rsi_signal?: string | null
          sma_200?: number | null
          sma_50?: number | null
          ticker?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "forex_technicals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "forex_technicals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forex_technicals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      form4_insider_trades: {
        Row: {
          asset_id: string | null
          checksum: string | null
          created_at: string | null
          filing_date: string
          form_url: string | null
          id: string
          insider_name: string
          insider_title: string | null
          is_direct_ownership: boolean | null
          metadata: Json | null
          price_per_share: number | null
          shares: number | null
          shares_owned_after: number | null
          ticker: string
          total_value: number | null
          transaction_date: string | null
          transaction_type: string | null
        }
        Insert: {
          asset_id?: string | null
          checksum?: string | null
          created_at?: string | null
          filing_date: string
          form_url?: string | null
          id?: string
          insider_name: string
          insider_title?: string | null
          is_direct_ownership?: boolean | null
          metadata?: Json | null
          price_per_share?: number | null
          shares?: number | null
          shares_owned_after?: number | null
          ticker: string
          total_value?: number | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Update: {
          asset_id?: string | null
          checksum?: string | null
          created_at?: string | null
          filing_date?: string
          form_url?: string | null
          id?: string
          insider_name?: string
          insider_title?: string | null
          is_direct_ownership?: boolean | null
          metadata?: Json | null
          price_per_share?: number | null
          shares?: number | null
          shares_owned_after?: number | null
          ticker?: string
          total_value?: number | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form4_insider_trades_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "form4_insider_trades_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form4_insider_trades_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      function_status: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          executed_at: string
          fallback_used: string | null
          function_name: string
          id: string
          metadata: Json | null
          rows_inserted: number | null
          rows_skipped: number | null
          source_used: string | null
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          fallback_used?: string | null
          function_name: string
          id?: string
          metadata?: Json | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          source_used?: string | null
          status: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          fallback_used?: string | null
          function_name?: string
          id?: string
          metadata?: Json | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          source_used?: string | null
          status?: string
        }
        Relationships: []
      }
      holdings_13f: {
        Row: {
          change_pct: number | null
          change_shares: number | null
          change_type: string | null
          checksum: string | null
          company_name: string | null
          created_at: string | null
          cusip: string
          filing_date: string
          id: string
          manager_cik: string
          manager_name: string
          period_of_report: string
          previous_shares: number | null
          previous_value: number | null
          shares: number
          source_url: string | null
          ticker: string | null
          updated_at: string | null
          value: number
        }
        Insert: {
          change_pct?: number | null
          change_shares?: number | null
          change_type?: string | null
          checksum?: string | null
          company_name?: string | null
          created_at?: string | null
          cusip: string
          filing_date: string
          id?: string
          manager_cik: string
          manager_name: string
          period_of_report: string
          previous_shares?: number | null
          previous_value?: number | null
          shares: number
          source_url?: string | null
          ticker?: string | null
          updated_at?: string | null
          value: number
        }
        Update: {
          change_pct?: number | null
          change_shares?: number | null
          change_type?: string | null
          checksum?: string | null
          company_name?: string | null
          created_at?: string | null
          cusip?: string
          filing_date?: string
          id?: string
          manager_cik?: string
          manager_name?: string
          period_of_report?: string
          previous_shares?: number | null
          previous_value?: number | null
          shares?: number
          source_url?: string | null
          ticker?: string | null
          updated_at?: string | null
          value?: number
        }
        Relationships: []
      }
      ingest_failures: {
        Row: {
          error_message: string
          error_type: string
          etl_name: string
          failed_at: string | null
          id: string
          metadata: Json | null
          retry_count: number | null
          status_code: number | null
          ticker: string | null
        }
        Insert: {
          error_message: string
          error_type: string
          etl_name: string
          failed_at?: string | null
          id?: string
          metadata?: Json | null
          retry_count?: number | null
          status_code?: number | null
          ticker?: string | null
        }
        Update: {
          error_message?: string
          error_type?: string
          etl_name?: string
          failed_at?: string | null
          id?: string
          metadata?: Json | null
          retry_count?: number | null
          status_code?: number | null
          ticker?: string | null
        }
        Relationships: []
      }
      ingest_logs: {
        Row: {
          cache_hit: boolean | null
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          etl_name: string
          fallback_count: number | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          rows_inserted: number | null
          rows_skipped: number | null
          rows_updated: number | null
          source_used: string | null
          started_at: string
          status: string
          verified_source: string | null
        }
        Insert: {
          cache_hit?: boolean | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          etl_name: string
          fallback_count?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          rows_updated?: number | null
          source_used?: string | null
          started_at?: string
          status: string
          verified_source?: string | null
        }
        Update: {
          cache_hit?: boolean | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          etl_name?: string
          fallback_count?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          rows_inserted?: number | null
          rows_skipped?: number | null
          rows_updated?: number | null
          source_used?: string | null
          started_at?: string
          status?: string
          verified_source?: string | null
        }
        Relationships: []
      }
      ingest_logs_test_audit: {
        Row: {
          actual_result: string | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          expected_result: string | null
          id: string
          metadata: Json | null
          status: string
          test_name: string
          test_suite: string
          tested_at: string | null
          ticker: string | null
        }
        Insert: {
          actual_result?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          expected_result?: string | null
          id?: string
          metadata?: Json | null
          status: string
          test_name: string
          test_suite: string
          tested_at?: string | null
          ticker?: string | null
        }
        Update: {
          actual_result?: string | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          expected_result?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          test_name?: string
          test_suite?: string
          tested_at?: string | null
          ticker?: string | null
        }
        Relationships: []
      }
      job_postings: {
        Row: {
          company: string
          created_at: string | null
          department: string | null
          growth_indicator: number | null
          id: string
          job_title: string | null
          location: string | null
          metadata: Json | null
          posted_date: string | null
          posting_count: number | null
          role_type: string | null
          seniority_level: string | null
          ticker: string
        }
        Insert: {
          company: string
          created_at?: string | null
          department?: string | null
          growth_indicator?: number | null
          id?: string
          job_title?: string | null
          location?: string | null
          metadata?: Json | null
          posted_date?: string | null
          posting_count?: number | null
          role_type?: string | null
          seniority_level?: string | null
          ticker: string
        }
        Update: {
          company?: string
          created_at?: string | null
          department?: string | null
          growth_indicator?: number | null
          id?: string
          job_title?: string | null
          location?: string | null
          metadata?: Json | null
          posted_date?: string | null
          posting_count?: number | null
          role_type?: string | null
          seniority_level?: string | null
          ticker?: string
        }
        Relationships: []
      }
      model_daily_metrics: {
        Row: {
          created_at: string | null
          cumulative_return: number
          graded_count: number
          hit_rate: number
          id: string
          max_drawdown: number
          mean_return: number
          median_return: number
          metadata: Json | null
          model_version: string
          objective_score: number
          p5_return: number
          predictions_count: number
          snapshot_date: string
          top_n: number
          volatility: number
        }
        Insert: {
          created_at?: string | null
          cumulative_return?: number
          graded_count?: number
          hit_rate?: number
          id?: string
          max_drawdown?: number
          mean_return?: number
          median_return?: number
          metadata?: Json | null
          model_version: string
          objective_score?: number
          p5_return?: number
          predictions_count?: number
          snapshot_date: string
          top_n: number
          volatility?: number
        }
        Update: {
          created_at?: string | null
          cumulative_return?: number
          graded_count?: number
          hit_rate?: number
          id?: string
          max_drawdown?: number
          mean_return?: number
          median_return?: number
          metadata?: Json | null
          model_version?: string
          objective_score?: number
          p5_return?: number
          predictions_count?: number
          snapshot_date?: string
          top_n?: number
          volatility?: number
        }
        Relationships: []
      }
      news_coverage_tracker: {
        Row: {
          created_at: string | null
          last_processed_at: string | null
          process_count: number | null
          ticker: string
        }
        Insert: {
          created_at?: string | null
          last_processed_at?: string | null
          process_count?: number | null
          ticker: string
        }
        Update: {
          created_at?: string | null
          last_processed_at?: string | null
          process_count?: number | null
          ticker?: string
        }
        Relationships: []
      }
      news_rss_articles: {
        Row: {
          checksum: string | null
          created_at: string | null
          headline: string
          id: string
          metadata: Json | null
          published_at: string | null
          relevance_score: number | null
          sentiment_label: string | null
          sentiment_score: number | null
          source: string
          summary: string | null
          ticker: string
          url: string | null
        }
        Insert: {
          checksum?: string | null
          created_at?: string | null
          headline: string
          id?: string
          metadata?: Json | null
          published_at?: string | null
          relevance_score?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          source: string
          summary?: string | null
          ticker: string
          url?: string | null
        }
        Update: {
          checksum?: string | null
          created_at?: string | null
          headline?: string
          id?: string
          metadata?: Json | null
          published_at?: string | null
          relevance_score?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          source?: string
          summary?: string | null
          ticker?: string
          url?: string | null
        }
        Relationships: []
      }
      news_sentiment_aggregate: {
        Row: {
          asset_id: string | null
          buzz_change_pct: number | null
          buzz_score: number | null
          created_at: string | null
          date: string
          id: string
          last_updated_at: string | null
          metadata: Json | null
          negative_articles: number | null
          neutral_articles: number | null
          positive_articles: number | null
          sentiment_by_source: Json | null
          sentiment_label: string | null
          sentiment_score: number | null
          ticker: string
          total_articles: number | null
          trending_keywords: string[] | null
        }
        Insert: {
          asset_id?: string | null
          buzz_change_pct?: number | null
          buzz_score?: number | null
          created_at?: string | null
          date: string
          id?: string
          last_updated_at?: string | null
          metadata?: Json | null
          negative_articles?: number | null
          neutral_articles?: number | null
          positive_articles?: number | null
          sentiment_by_source?: Json | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          ticker: string
          total_articles?: number | null
          trending_keywords?: string[] | null
        }
        Update: {
          asset_id?: string | null
          buzz_change_pct?: number | null
          buzz_score?: number | null
          created_at?: string | null
          date?: string
          id?: string
          last_updated_at?: string | null
          metadata?: Json | null
          negative_articles?: number | null
          neutral_articles?: number | null
          positive_articles?: number | null
          sentiment_by_source?: Json | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          ticker?: string
          total_articles?: number | null
          trending_keywords?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "news_sentiment_aggregate_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "news_sentiment_aggregate_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_sentiment_aggregate_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      options_flow: {
        Row: {
          created_at: string | null
          expiration_date: string | null
          flow_type: string | null
          id: string
          implied_volatility: number | null
          metadata: Json | null
          open_interest: number | null
          option_type: string | null
          premium: number | null
          sentiment: string | null
          strike_price: number | null
          ticker: string
          trade_date: string | null
          volume: number | null
        }
        Insert: {
          created_at?: string | null
          expiration_date?: string | null
          flow_type?: string | null
          id?: string
          implied_volatility?: number | null
          metadata?: Json | null
          open_interest?: number | null
          option_type?: string | null
          premium?: number | null
          sentiment?: string | null
          strike_price?: number | null
          ticker: string
          trade_date?: string | null
          volume?: number | null
        }
        Update: {
          created_at?: string | null
          expiration_date?: string | null
          flow_type?: string | null
          id?: string
          implied_volatility?: number | null
          metadata?: Json | null
          open_interest?: number | null
          option_type?: string | null
          premium?: number | null
          sentiment?: string | null
          strike_price?: number | null
          ticker?: string
          trade_date?: string | null
          volume?: number | null
        }
        Relationships: []
      }
      patent_filings: {
        Row: {
          company: string | null
          created_at: string | null
          filing_date: string | null
          id: string
          metadata: Json | null
          patent_number: string | null
          patent_title: string | null
          technology_category: string | null
          ticker: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          filing_date?: string | null
          id?: string
          metadata?: Json | null
          patent_number?: string | null
          patent_title?: string | null
          technology_category?: string | null
          ticker: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          filing_date?: string | null
          id?: string
          metadata?: Json | null
          patent_number?: string | null
          patent_title?: string | null
          technology_category?: string | null
          ticker?: string
        }
        Relationships: []
      }
      pattern_recognition: {
        Row: {
          asset_id: string | null
          confidence_score: number | null
          created_at: string | null
          detected_at: string
          entry_price: number | null
          historical_success_rate: number | null
          id: string
          metadata: Json | null
          pattern_category: string | null
          pattern_completion_pct: number | null
          pattern_type: string
          risk_reward_ratio: number | null
          status: string | null
          stop_loss_price: number | null
          target_price: number | null
          ticker: string
          timeframe: string | null
          updated_at: string | null
          volume_confirmed: boolean | null
        }
        Insert: {
          asset_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          detected_at?: string
          entry_price?: number | null
          historical_success_rate?: number | null
          id?: string
          metadata?: Json | null
          pattern_category?: string | null
          pattern_completion_pct?: number | null
          pattern_type: string
          risk_reward_ratio?: number | null
          status?: string | null
          stop_loss_price?: number | null
          target_price?: number | null
          ticker: string
          timeframe?: string | null
          updated_at?: string | null
          volume_confirmed?: boolean | null
        }
        Update: {
          asset_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          detected_at?: string
          entry_price?: number | null
          historical_success_rate?: number | null
          id?: string
          metadata?: Json | null
          pattern_category?: string | null
          pattern_completion_pct?: number | null
          pattern_type?: string
          risk_reward_ratio?: number | null
          status?: string | null
          stop_loss_price?: number | null
          target_price?: number | null
          ticker?: string
          timeframe?: string | null
          updated_at?: string | null
          volume_confirmed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pattern_recognition_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "pattern_recognition_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pattern_recognition_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_feeds: {
        Row: {
          affected_sectors: string[] | null
          affected_tickers: string[] | null
          checksum: string | null
          created_at: string | null
          id: string
          impact_assessment: string | null
          impact_score: number | null
          metadata: Json | null
          policy_type: string
          published_at: string | null
          source: string | null
          source_url: string | null
          summary: string | null
          ticker: string | null
          title: string
        }
        Insert: {
          affected_sectors?: string[] | null
          affected_tickers?: string[] | null
          checksum?: string | null
          created_at?: string | null
          id?: string
          impact_assessment?: string | null
          impact_score?: number | null
          metadata?: Json | null
          policy_type: string
          published_at?: string | null
          source?: string | null
          source_url?: string | null
          summary?: string | null
          ticker?: string | null
          title: string
        }
        Update: {
          affected_sectors?: string[] | null
          affected_tickers?: string[] | null
          checksum?: string | null
          created_at?: string | null
          id?: string
          impact_assessment?: string | null
          impact_score?: number | null
          metadata?: Json | null
          policy_type?: string
          published_at?: string | null
          source?: string | null
          source_url?: string | null
          summary?: string | null
          ticker?: string | null
          title?: string
        }
        Relationships: []
      }
      price_coverage_daily: {
        Row: {
          asset_class: string | null
          asset_id: string | null
          created_at: string | null
          days_stale: number
          last_price_date: string | null
          points_30d: number
          points_90d: number
          reason: string
          snapshot_date: string
          status: string
          ticker: string
          vendor: string
        }
        Insert: {
          asset_class?: string | null
          asset_id?: string | null
          created_at?: string | null
          days_stale?: number
          last_price_date?: string | null
          points_30d?: number
          points_90d?: number
          reason?: string
          snapshot_date: string
          status: string
          ticker: string
          vendor?: string
        }
        Update: {
          asset_class?: string | null
          asset_id?: string | null
          created_at?: string | null
          days_stale?: number
          last_price_date?: string | null
          points_30d?: number
          points_90d?: number
          reason?: string
          snapshot_date?: string
          status?: string
          ticker?: string
          vendor?: string
        }
        Relationships: []
      }
      price_ingestion_log: {
        Row: {
          error_message: string
          id: string
          newest_date_returned: string | null
          raw: Json
          requested_at: string
          response_code: number | null
          rows_inserted: number
          run_id: string
          ticker: string
          vendor: string
          vendor_status: string
        }
        Insert: {
          error_message?: string
          id?: string
          newest_date_returned?: string | null
          raw?: Json
          requested_at?: string
          response_code?: number | null
          rows_inserted?: number
          run_id: string
          ticker: string
          vendor?: string
          vendor_status: string
        }
        Update: {
          error_message?: string
          id?: string
          newest_date_returned?: string | null
          raw?: Json
          requested_at?: string
          response_code?: number | null
          rows_inserted?: number
          run_id?: string
          ticker?: string
          vendor?: string
          vendor_status?: string
        }
        Relationships: []
      }
      prices: {
        Row: {
          asset_id: string | null
          checksum: string
          close: number
          created_at: string | null
          date: string
          id: string
          last_updated_at: string | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          asset_id?: string | null
          checksum: string
          close: number
          created_at?: string | null
          date: string
          id?: string
          last_updated_at?: string | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          asset_id?: string | null
          checksum?: string
          close?: number
          created_at?: string | null
          date?: string
          id?: string
          last_updated_at?: string | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "prices_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_config: {
        Row: {
          config_name: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          weights: Json
        }
        Insert: {
          config_name: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          weights?: Json
        }
        Update: {
          config_name?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          weights?: Json
        }
        Relationships: []
      }
      scoring_validation_results: {
        Row: {
          created_at: string
          critical_passed: number
          critical_total: number
          decile_analysis: Json | null
          id: string
          overall_status: string
          results: Json | null
          test_run_at: string
          tests_passed: number
          tests_total: number
        }
        Insert: {
          created_at?: string
          critical_passed: number
          critical_total: number
          decile_analysis?: Json | null
          id?: string
          overall_status: string
          results?: Json | null
          test_run_at?: string
          tests_passed: number
          tests_total: number
        }
        Update: {
          created_at?: string
          critical_passed?: number
          critical_total?: number
          decile_analysis?: Json | null
          id?: string
          overall_status?: string
          results?: Json | null
          test_run_at?: string
          tests_passed?: number
          tests_total?: number
        }
        Relationships: []
      }
      search_trends: {
        Row: {
          created_at: string | null
          id: string
          keyword: string
          period_end: string
          period_start: string
          region: string | null
          search_volume: number | null
          ticker: string
          trend_change: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          keyword: string
          period_end: string
          period_start: string
          region?: string | null
          search_volume?: number | null
          ticker: string
          trend_change?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          keyword?: string
          period_end?: string
          period_start?: string
          region?: string | null
          search_volume?: number | null
          ticker?: string
          trend_change?: number | null
        }
        Relationships: []
      }
      short_interest: {
        Row: {
          created_at: string | null
          days_to_cover: number | null
          float_percentage: number | null
          id: string
          metadata: Json | null
          report_date: string
          short_volume: number | null
          ticker: string
        }
        Insert: {
          created_at?: string | null
          days_to_cover?: number | null
          float_percentage?: number | null
          id?: string
          metadata?: Json | null
          report_date: string
          short_volume?: number | null
          ticker: string
        }
        Update: {
          created_at?: string | null
          days_to_cover?: number | null
          float_percentage?: number | null
          id?: string
          metadata?: Json | null
          report_date?: string
          short_volume?: number | null
          ticker?: string
        }
        Relationships: []
      }
      signal_generation_diagnostics: {
        Row: {
          count: number
          created_at: string | null
          excluded_reason: string
          generator: string
          id: string
          sample_tickers: string[]
          snapshot_date: string
        }
        Insert: {
          count?: number
          created_at?: string | null
          excluded_reason: string
          generator: string
          id?: string
          sample_tickers?: string[]
          snapshot_date: string
        }
        Update: {
          count?: number
          created_at?: string | null
          excluded_reason?: string
          generator?: string
          id?: string
          sample_tickers?: string[]
          snapshot_date?: string
        }
        Relationships: []
      }
      signal_theme_map: {
        Row: {
          created_at: string | null
          id: string
          relevance_score: number | null
          signal_id: string
          theme_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          relevance_score?: number | null
          signal_id: string
          theme_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          relevance_score?: number | null
          signal_id?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_theme_map_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_theme_map_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "theme_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_theme_map_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_type_alpha: {
        Row: {
          avg_forward_return: number
          hit_rate: number
          horizon: string
          id: string
          sample_size: number
          signal_type: string
          std_forward_return: number
          updated_at: string
        }
        Insert: {
          avg_forward_return?: number
          hit_rate?: number
          horizon?: string
          id?: string
          sample_size?: number
          signal_type: string
          std_forward_return?: number
          updated_at?: string
        }
        Update: {
          avg_forward_return?: number
          hit_rate?: number
          horizon?: string
          id?: string
          sample_size?: number
          signal_type?: string
          std_forward_return?: number
          updated_at?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          ai_explanation: string | null
          asset_class: string | null
          asset_id: string | null
          checksum: string
          citation: Json
          composite_score: number | null
          confidence_score: number | null
          created_at: string | null
          direction: Database["public"]["Enums"]["signal_direction"] | null
          fallback_used: boolean | null
          id: string
          magnitude: number | null
          observed_at: string
          raw: Json | null
          score_factors: Json | null
          signal_category: string | null
          signal_classification: string | null
          signal_type: string
          source_id: string | null
          source_used: string | null
          theme_id: string | null
          time_horizon: string | null
          value_text: string | null
        }
        Insert: {
          ai_explanation?: string | null
          asset_class?: string | null
          asset_id?: string | null
          checksum: string
          citation: Json
          composite_score?: number | null
          confidence_score?: number | null
          created_at?: string | null
          direction?: Database["public"]["Enums"]["signal_direction"] | null
          fallback_used?: boolean | null
          id?: string
          magnitude?: number | null
          observed_at: string
          raw?: Json | null
          score_factors?: Json | null
          signal_category?: string | null
          signal_classification?: string | null
          signal_type: string
          source_id?: string | null
          source_used?: string | null
          theme_id?: string | null
          time_horizon?: string | null
          value_text?: string | null
        }
        Update: {
          ai_explanation?: string | null
          asset_class?: string | null
          asset_id?: string | null
          checksum?: string
          citation?: Json
          composite_score?: number | null
          confidence_score?: number | null
          created_at?: string | null
          direction?: Database["public"]["Enums"]["signal_direction"] | null
          fallback_used?: boolean | null
          id?: string
          magnitude?: number | null
          observed_at?: string
          raw?: Json | null
          score_factors?: Json | null
          signal_category?: string | null
          signal_classification?: string | null
          signal_type?: string
          source_id?: string | null
          source_used?: string | null
          theme_id?: string | null
          time_horizon?: string | null
          value_text?: string | null
        }
        Relationships: []
      }
      smart_money_flow: {
        Row: {
          ad_line: number | null
          ad_trend: string | null
          asset_class: string
          asset_id: string | null
          cmf: number | null
          cmf_signal: string | null
          created_at: string | null
          id: string
          institutional_buy_volume: number | null
          institutional_net_flow: number | null
          institutional_sell_volume: number | null
          metadata: Json | null
          mfi: number | null
          mfi_signal: string | null
          retail_buy_volume: number | null
          retail_net_flow: number | null
          retail_sell_volume: number | null
          smart_money_index: number | null
          smart_money_signal: string | null
          source: string | null
          ticker: string
          timestamp: string
        }
        Insert: {
          ad_line?: number | null
          ad_trend?: string | null
          asset_class: string
          asset_id?: string | null
          cmf?: number | null
          cmf_signal?: string | null
          created_at?: string | null
          id?: string
          institutional_buy_volume?: number | null
          institutional_net_flow?: number | null
          institutional_sell_volume?: number | null
          metadata?: Json | null
          mfi?: number | null
          mfi_signal?: string | null
          retail_buy_volume?: number | null
          retail_net_flow?: number | null
          retail_sell_volume?: number | null
          smart_money_index?: number | null
          smart_money_signal?: string | null
          source?: string | null
          ticker: string
          timestamp?: string
        }
        Update: {
          ad_line?: number | null
          ad_trend?: string | null
          asset_class?: string
          asset_id?: string | null
          cmf?: number | null
          cmf_signal?: string | null
          created_at?: string | null
          id?: string
          institutional_buy_volume?: number | null
          institutional_net_flow?: number | null
          institutional_sell_volume?: number | null
          metadata?: Json | null
          mfi?: number | null
          mfi_signal?: string | null
          retail_buy_volume?: number | null
          retail_net_flow?: number | null
          retail_sell_volume?: number | null
          smart_money_index?: number | null
          smart_money_signal?: string | null
          source?: string | null
          ticker?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_money_flow_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "smart_money_flow_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_money_flow_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      social_signals: {
        Row: {
          bearish_count: number | null
          bullish_count: number | null
          created_at: string | null
          id: string
          mention_count: number | null
          metadata: Json | null
          post_volume: number | null
          sentiment_score: number | null
          signal_date: string
          source: string
          ticker: string
        }
        Insert: {
          bearish_count?: number | null
          bullish_count?: number | null
          created_at?: string | null
          id?: string
          mention_count?: number | null
          metadata?: Json | null
          post_volume?: number | null
          sentiment_score?: number | null
          signal_date?: string
          source: string
          ticker: string
        }
        Update: {
          bearish_count?: number | null
          bullish_count?: number | null
          created_at?: string | null
          id?: string
          mention_count?: number | null
          metadata?: Json | null
          post_volume?: number | null
          sentiment_score?: number | null
          signal_date?: string
          source?: string
          ticker?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string | null
          id: string
          last_fetched: string | null
          metadata: Json | null
          type: string
          url: string
        }
        Insert: {
          created_at?: string | null
          id: string
          last_fetched?: string | null
          metadata?: Json | null
          type: string
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_fetched?: string | null
          metadata?: Json | null
          type?: string
          url?: string
        }
        Relationships: []
      }
      supply_chain_signals: {
        Row: {
          change_percentage: number | null
          created_at: string | null
          id: string
          indicator: string | null
          metadata: Json | null
          metric_name: string | null
          metric_value: number | null
          report_date: string
          signal_type: string
          ticker: string
        }
        Insert: {
          change_percentage?: number | null
          created_at?: string | null
          id?: string
          indicator?: string | null
          metadata?: Json | null
          metric_name?: string | null
          metric_value?: number | null
          report_date: string
          signal_type: string
          ticker: string
        }
        Update: {
          change_percentage?: number | null
          created_at?: string | null
          id?: string
          indicator?: string | null
          metadata?: Json | null
          metric_name?: string | null
          metric_value?: number | null
          report_date?: string
          signal_type?: string
          ticker?: string
        }
        Relationships: []
      }
      theme_analyses: {
        Row: {
          analysis_type: string
          days_window: number | null
          generated_at: string | null
          id: string
          key_drivers: Json | null
          model: string | null
          signal_count: number | null
          strength: string | null
          summary: string | null
          theme_id: string | null
          theme_name: string | null
        }
        Insert: {
          analysis_type: string
          days_window?: number | null
          generated_at?: string | null
          id?: string
          key_drivers?: Json | null
          model?: string | null
          signal_count?: number | null
          strength?: string | null
          summary?: string | null
          theme_id?: string | null
          theme_name?: string | null
        }
        Update: {
          analysis_type?: string
          days_window?: number | null
          generated_at?: string | null
          id?: string
          key_drivers?: Json | null
          model?: string | null
          signal_count?: number | null
          strength?: string | null
          summary?: string | null
          theme_id?: string | null
          theme_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "theme_analyses_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "theme_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_analyses_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_scores: {
        Row: {
          component_scores: Json | null
          computed_at: string
          created_at: string | null
          id: string
          positive_components: string[] | null
          score: number
          signal_count: number | null
          theme_id: string
        }
        Insert: {
          component_scores?: Json | null
          computed_at?: string
          created_at?: string | null
          id?: string
          positive_components?: string[] | null
          score?: number
          signal_count?: number | null
          theme_id: string
        }
        Update: {
          component_scores?: Json | null
          computed_at?: string
          created_at?: string | null
          id?: string
          positive_components?: string[] | null
          score?: number
          signal_count?: number | null
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theme_scores_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: true
            referencedRelation: "theme_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_scores_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: true
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          ai_summary: string | null
          alpha: number | null
          contributors: Json | null
          created_at: string | null
          id: string
          keywords: string[]
          metadata: Json | null
          name: string
          score: number | null
          tickers: string[] | null
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          alpha?: number | null
          contributors?: Json | null
          created_at?: string | null
          id?: string
          keywords?: string[]
          metadata?: Json | null
          name: string
          score?: number | null
          tickers?: string[] | null
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          alpha?: number | null
          contributors?: Json | null
          created_at?: string | null
          id?: string
          keywords?: string[]
          metadata?: Json | null
          name?: string
          score?: number | null
          tickers?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trade_signals: {
        Row: {
          ai_score_at_entry: number | null
          asset_id: string | null
          created_at: string | null
          entry_date: string | null
          entry_price: number | null
          exit_date: string | null
          exit_price: number | null
          exit_target: number | null
          expires_at: string | null
          id: string
          peak_price: number | null
          pnl_pct: number | null
          position_size_pct: number | null
          reason: string | null
          score_at_entry: number | null
          signal_type: string
          status: string
          stop_loss: number | null
          ticker: string
          updated_at: string | null
        }
        Insert: {
          ai_score_at_entry?: number | null
          asset_id?: string | null
          created_at?: string | null
          entry_date?: string | null
          entry_price?: number | null
          exit_date?: string | null
          exit_price?: number | null
          exit_target?: number | null
          expires_at?: string | null
          id?: string
          peak_price?: number | null
          pnl_pct?: number | null
          position_size_pct?: number | null
          reason?: string | null
          score_at_entry?: number | null
          signal_type: string
          status?: string
          stop_loss?: number | null
          ticker: string
          updated_at?: string | null
        }
        Update: {
          ai_score_at_entry?: number | null
          asset_id?: string | null
          created_at?: string | null
          entry_date?: string | null
          entry_price?: number | null
          exit_date?: string | null
          exit_price?: number | null
          exit_target?: number | null
          expires_at?: string | null
          id?: string
          peak_price?: number | null
          pnl_pct?: number | null
          position_size_pct?: number | null
          reason?: string | null
          score_at_entry?: number | null
          signal_type?: string
          status?: string
          stop_loss?: number | null
          ticker?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_signals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "asset_signal_summary"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "trade_signals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_signals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_ticker_commas"
            referencedColumns: ["id"]
          },
        ]
      }
      twelvedata_rate_limits: {
        Row: {
          credits_used: number
          id: string
          last_updated_at: string
          minute_key: string
        }
        Insert: {
          credits_used?: number
          id?: string
          last_updated_at?: string
          minute_key: string
        }
        Update: {
          credits_used?: number
          id?: string
          last_updated_at?: string
          minute_key?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_theme_subscriptions: {
        Row: {
          id: string
          subscribed_at: string | null
          theme_id: string
          user_id: string
        }
        Insert: {
          id?: string
          subscribed_at?: string | null
          theme_id: string
          user_id: string
        }
        Update: {
          id?: string
          subscribed_at?: string | null
          theme_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_theme_subscriptions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "theme_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_theme_subscriptions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          created_at: string | null
          id: string
          tickers: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          tickers?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          tickers?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      asset_signal_summary: {
        Row: {
          asset_class: string | null
          asset_id: string | null
          flow_signals: number | null
          insider_signals: number | null
          institutional_signals: number | null
          latest_signal_at: string | null
          name: string | null
          sentiment_signals: number | null
          technical_signals: number | null
          ticker: string | null
        }
        Relationships: []
      }
      assets_ticker_commas: {
        Row: {
          asset_class: string | null
          created_at: string | null
          id: string | null
          name: string | null
          ticker: string | null
        }
        Insert: {
          asset_class?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          ticker?: string | null
        }
        Update: {
          asset_class?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          ticker?: string | null
        }
        Relationships: []
      }
      interest_rate_differentials: {
        Row: {
          country_a: string | null
          country_b: string | null
          differential: number | null
          differential_signal: string | null
          rate_a: number | null
          rate_b: number | null
          release_date: string | null
        }
        Relationships: []
      }
      source_usage_stats: {
        Row: {
          first_seen: string | null
          last_seen: string | null
          percentage: number | null
          source_used: string | null
          total_signals: number | null
        }
        Relationships: []
      }
      theme_overview: {
        Row: {
          cached_score: number | null
          component_scores: Json | null
          id: string | null
          keywords: string[] | null
          latest_score: number | null
          name: string | null
          positive_components: string[] | null
          score_updated_at: string | null
          signal_count: number | null
          subscriber_count: number | null
          tickers: string[] | null
          total_mapped_signals: number | null
        }
        Relationships: []
      }
      view_api_errors: {
        Row: {
          duration_seconds: number | null
          error_message: string | null
          error_time: string | null
          etl_name: string | null
          metadata: Json | null
          status: string | null
        }
        Insert: {
          duration_seconds?: number | null
          error_message?: string | null
          error_time?: string | null
          etl_name?: string | null
          metadata?: Json | null
          status?: string | null
        }
        Update: {
          duration_seconds?: number | null
          error_message?: string | null
          error_time?: string | null
          etl_name?: string | null
          metadata?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      view_duplicate_key_errors: {
        Row: {
          error_count: number | null
          error_hour: string | null
          etl_name: string | null
          last_occurrence: string | null
        }
        Relationships: []
      }
      view_fallback_usage: {
        Row: {
          etl_name: string | null
          fallback_count: number | null
          fallback_percentage: number | null
          last_run_at: string | null
          total_runs: number | null
        }
        Relationships: []
      }
      view_function_freshness: {
        Row: {
          failure_count: number | null
          fallback_used_count: number | null
          function_name: string | null
          last_run: string | null
          seconds_since_last_run: number | null
          skipped_count: number | null
          success_count: number | null
          success_rate_pct: number | null
          total_rows_inserted: number | null
          total_rows_skipped: number | null
        }
        Relationships: []
      }
      view_stale_tickers: {
        Row: {
          asset_class: string | null
          last_updated_at: string | null
          seconds_stale: number | null
          table_name: string | null
          ticker: string | null
        }
        Relationships: []
      }
      view_test_suite_summary: {
        Row: {
          failed: number | null
          last_run: string | null
          passed: number | null
          test_suite: string | null
          total: number | null
          warnings: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_twelvedata_credits: {
        Args: { credits_needed: number; max_credits?: number }
        Returns: {
          acquired: boolean
          current_credits: number
          wait_seconds: number
        }[]
      }
      apply_scoring_recenter: { Args: { correction: number }; Returns: number }
      check_ai_fallback_usage: {
        Args: never
        Returns: {
          etl_name: string
          fallback_percentage: number
          fallback_runs: number
          is_excessive: boolean
          message: string
          total_runs: number
        }[]
      }
      check_excessive_fallback_usage: {
        Args: never
        Returns: {
          etl_name: string
          fallback_percentage: number
          message: string
          total_runs: number
        }[]
      }
      check_function_staleness: {
        Args: { p_function_name: string; p_max_age_minutes: number }
        Returns: boolean
      }
      check_signal_distribution_skew: {
        Args: never
        Returns: {
          alert_type: string
          buy_count: number
          buy_percentage: number
          is_skewed: boolean
          message: string
          neutral_count: number
          neutral_percentage: number
          sell_count: number
          sell_percentage: number
        }[]
      }
      compute_and_update_coverage: {
        Args: {
          p_freshness_days?: number
          p_snapshot_date: string
          p_vendor?: string
        }
        Returns: {
          assets_updated: number
          coverage_rows_upserted: number
          fresh_count: number
          missing_count: number
          stale_count: number
        }[]
      }
      execute_sql: { Args: { sql: string }; Returns: Json }
      get_api_usage_summary: {
        Args: { hours_back?: number }
        Returns: {
          api_name: string
          avg_response_time_ms: number
          cached_calls: number
          estimated_cost: number
          failed_calls: number
          success_rate: number
          successful_calls: number
          total_calls: number
        }[]
      }
      get_latest_theme_score: {
        Args: { p_theme_id: string }
        Returns: {
          component_scores: Json
          computed_at: string
          positive_components: string[]
          score: number
          signal_count: number
        }[]
      }
      get_price_aggregates: {
        Args: { p_freshness_days?: number; p_snapshot_date: string }
        Returns: {
          asset_class: string
          asset_id: string
          days_stale: number
          last_price_date: string
          points_30d: number
          points_90d: number
          reason: string
          status: string
          ticker: string
        }[]
      }
      get_price_changes: {
        Args: { cutoff_date: string }
        Returns: {
          change_pct: number
          ticker: string
        }[]
      }
      get_scoring_global_mean: {
        Args: never
        Returns: {
          cnt: number
          global_mean: number
        }[]
      }
      get_stale_functions: {
        Args: never
        Returns: {
          alert_severity: string
          expected_interval_minutes: number
          function_name: string
          last_run: string
          minutes_stale: number
        }[]
      }
      get_stale_tickers: {
        Args: { p_asset_class?: string }
        Returns: {
          asset_class: string
          last_updated_at: string
          seconds_stale: number
          table_name: string
          ticker: string
        }[]
      }
      get_twelvedata_credits_status: {
        Args: never
        Returns: {
          credits_remaining: number
          credits_used: number
          minute_key: string
          seconds_until_reset: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_subscribed_to_theme: {
        Args: { p_theme_id: string; p_user_id: string }
        Returns: boolean
      }
      update_assets_from_coverage: {
        Args: { p_snapshot_date: string; p_vendor?: string }
        Returns: {
          updated_count: number
        }[]
      }
    }
    Enums: {
      alert_status: "active" | "dismissed"
      app_role:
        | "free"
        | "lite"
        | "pro"
        | "admin"
        | "starter"
        | "premium"
        | "enterprise"
      signal_direction: "up" | "down" | "neutral"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_status: ["active", "dismissed"],
      app_role: [
        "free",
        "lite",
        "pro",
        "admin",
        "starter",
        "premium",
        "enterprise",
      ],
      signal_direction: ["up", "down", "neutral"],
    },
  },
} as const
