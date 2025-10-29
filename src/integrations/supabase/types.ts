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
    }
    Views: {
      [_ in never]: never
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
      app_role: "free" | "lite" | "pro" | "admin"
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
      app_role: ["free", "lite", "pro", "admin"],
    },
  },
} as const
