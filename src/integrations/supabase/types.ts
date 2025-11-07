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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_class: string | null
          base_currency: string | null
          contract_size: number | null
          created_at: string | null
          exchange: string
          id: string
          metadata: Json | null
          name: string
          pip_value: number | null
          quote_currency: string | null
          spread_typical: number | null
          ticker: string
        }
        Insert: {
          asset_class?: string | null
          base_currency?: string | null
          contract_size?: number | null
          created_at?: string | null
          exchange: string
          id?: string
          metadata?: Json | null
          name: string
          pip_value?: number | null
          quote_currency?: string | null
          spread_typical?: number | null
          ticker: string
        }
        Update: {
          asset_class?: string | null
          base_currency?: string | null
          contract_size?: number | null
          created_at?: string | null
          exchange?: string
          id?: string
          metadata?: Json | null
          name?: string
          pip_value?: number | null
          quote_currency?: string | null
          spread_typical?: number | null
          ticker?: string
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
      broker_keys: {
        Row: {
          account_type: string | null
          api_key_encrypted: string
          broker_name: string | null
          created_at: string
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
            referencedRelation: "assets"
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
          metadata: Json | null
          previous_value: number | null
          release_date: string
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
          metadata?: Json | null
          previous_value?: number | null
          release_date: string
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
          metadata?: Json | null
          previous_value?: number | null
          release_date?: string
          source?: string | null
          value?: number
        }
        Relationships: []
      }
      forex_sentiment: {
        Row: {
          asset_id: string | null
          created_at: string | null
          id: string
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
            referencedRelation: "assets"
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
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
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
      prices: {
        Row: {
          asset_id: string | null
          checksum: string
          close: number
          created_at: string | null
          date: string
          id: string
          ticker: string
        }
        Insert: {
          asset_id?: string | null
          checksum: string
          close: number
          created_at?: string | null
          date: string
          id?: string
          ticker: string
        }
        Update: {
          asset_id?: string | null
          checksum?: string
          close?: number
          created_at?: string | null
          date?: string
          id?: string
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
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
      signals: {
        Row: {
          asset_id: string | null
          checksum: string
          citation: Json
          created_at: string | null
          direction: Database["public"]["Enums"]["signal_direction"] | null
          id: string
          magnitude: number | null
          observed_at: string
          raw: Json | null
          signal_type: string
          source_id: string | null
          theme_id: string | null
          value_text: string | null
        }
        Insert: {
          asset_id?: string | null
          checksum: string
          citation: Json
          created_at?: string | null
          direction?: Database["public"]["Enums"]["signal_direction"] | null
          id?: string
          magnitude?: number | null
          observed_at: string
          raw?: Json | null
          signal_type: string
          source_id?: string | null
          theme_id?: string | null
          value_text?: string | null
        }
        Update: {
          asset_id?: string | null
          checksum?: string
          citation?: Json
          created_at?: string | null
          direction?: Database["public"]["Enums"]["signal_direction"] | null
          id?: string
          magnitude?: number | null
          observed_at?: string
          raw?: Json | null
          signal_type?: string
          source_id?: string | null
          theme_id?: string | null
          value_text?: string | null
        }
        Relationships: []
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
      themes: {
        Row: {
          alpha: number | null
          contributors: Json | null
          created_at: string | null
          id: string
          keywords: string[]
          metadata: Json | null
          name: string
          updated_at: string | null
        }
        Insert: {
          alpha?: number | null
          contributors?: Json | null
          created_at?: string | null
          id?: string
          keywords?: string[]
          metadata?: Json | null
          name: string
          updated_at?: string | null
        }
        Update: {
          alpha?: number | null
          contributors?: Json | null
          created_at?: string | null
          id?: string
          keywords?: string[]
          metadata?: Json | null
          name?: string
          updated_at?: string | null
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
    }
    Functions: {
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
    }
    Enums: {
      alert_status: "active" | "dismissed"
      app_role: "free" | "lite" | "pro" | "admin"
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
      app_role: ["free", "lite", "pro", "admin"],
      signal_direction: ["up", "down", "neutral"],
    },
  },
} as const
