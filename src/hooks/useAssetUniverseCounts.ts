import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live per-class + total asset universe counts. Sourced from the
 * SECURITY DEFINER RPC `get_asset_universe_counts()` so every caller
 * (header counter, paywall banners, lock copy) reads the same numbers
 * and we don't depend on per-table HEAD count grants.
 *
 * Tier coverage maps to the server RPC `get_assets_for_user`:
 *   starter -> ['stock']
 *   pro     -> ['stock','etf','forex']
 *   premium -> all classes
 */
export type AssetClassCounts = {
  stock: number;
  etf: number;
  forex: number;
  crypto: number;
  commodity: number;
  total: number;
  starterCoverage: number;   // stock
  proCoverage: number;       // stock + etf + forex
  premiumCoverage: number;   // all
};

type RpcRow = {
  stock: number | string;
  etf: number | string;
  forex: number | string;
  crypto: number | string;
  commodity: number | string;
  total: number | string;
  starter_coverage: number | string;
  pro_coverage: number | string;
  premium_coverage: number | string;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

export function useAssetUniverseCounts() {
  return useQuery<AssetClassCounts>({
    queryKey: ["asset-universe-counts"],
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_asset_universe_counts");
      if (error) throw error;
      const row: RpcRow | undefined = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("get_asset_universe_counts returned no rows");
      return {
        stock: num(row.stock),
        etf: num(row.etf),
        forex: num(row.forex),
        crypto: num(row.crypto),
        commodity: num(row.commodity),
        total: num(row.total),
        starterCoverage: num(row.starter_coverage),
        proCoverage: num(row.pro_coverage),
        premiumCoverage: num(row.premium_coverage),
      };
    },
  });
}

/**
 * Format an asset count. Returns null when the value is unknown so callers
 * can render a skeleton instead of an em-dash. The legacy `"—"` fallback
 * has been removed — a missing count must never appear as a glyph in copy.
 */
export function formatCount(n: number | undefined | null): string | null {
  if (n == null || n <= 0) return null;
  return n.toLocaleString("en-US");
}
