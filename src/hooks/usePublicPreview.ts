import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PublicDemoAsset {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  asset_class: string | null;
  score: number;
  hybrid_score: number | null;
  computed_score: number | null;
  score_explanation: unknown;
  score_computed_at: string | null;
  price: number | null;
  price_change_pct: number | null;
}

export interface PublicBlurredAsset {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  asset_class: string | null;
}

export interface PublicDemoTheme {
  id: string;
  name: string;
  score: number | null;
  is_demo: boolean;
  ai_summary: string | null;
  tickers: string[] | null;
  keywords: string[] | null;
  signal_count: number;
  last_calculated_at: string | null;
  created_at: string | null;
}

export interface PublicBlurredTheme {
  id: string;
  name: string;
  keywords: string[] | null;
}

export interface PublicDemoSignal {
  id: string;
  ticker: string;
  signal_type: string;
  status: string;
  entry_price: number | null;
  exit_target: number | null;
  stop_loss: number | null;
  peak_price: number | null;
  position_size_pct: number | null;
  score_at_entry: number | null;
  ai_score_at_entry: number | null;
  expires_at: string | null;
  created_at: string;
  reason: string | null;
  last_live_price: number | null;
  last_live_price_at: string | null;
}

export interface PublicPreviewPayload {
  demo_assets: PublicDemoAsset[];
  blurred_assets: PublicBlurredAsset[];
  total_asset_count: number;
  scored_asset_count: number;
  demo_themes: PublicDemoTheme[];
  blurred_themes: PublicBlurredTheme[];
  total_theme_count: number;
  demo_signal: PublicDemoSignal | null;
  total_active_signal_count: number;
  generated_at: string;
}

export function usePublicPreview() {
  return useQuery({
    queryKey: ["public_preview"],
    queryFn: async (): Promise<PublicPreviewPayload> => {
      const { data, error } = await (supabase.rpc as any)("get_public_preview");
      if (error) throw error;
      return data as PublicPreviewPayload;
    },
    staleTime: 60_000,
  });
}
