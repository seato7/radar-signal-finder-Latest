import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live per-class + total asset universe counts. Reads directly from the
 * publicly-readable `assets` table so the UI never drifts from reality
 * (no more hardcoded "25,536"). Cached for 1h.
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

const EMPTY: AssetClassCounts = {
  stock: 0, etf: 0, forex: 0, crypto: 0, commodity: 0,
  total: 0, starterCoverage: 0, proCoverage: 0, premiumCoverage: 0,
};

export function useAssetUniverseCounts() {
  return useQuery<AssetClassCounts>({
    queryKey: ["asset-universe-counts"],
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const classes = ["stock", "etf", "forex", "crypto", "commodity"] as const;
      const results = await Promise.all(
        classes.map((c) =>
          supabase
            .from("assets")
            .select("id", { count: "exact", head: true })
            .eq("asset_class", c)
            .then((r) => ({ c, count: r.count ?? 0 }))
        )
      );
      const map = Object.fromEntries(results.map((r) => [r.c, r.count])) as Record<typeof classes[number], number>;
      const total = classes.reduce((s, c) => s + (map[c] ?? 0), 0);
      return {
        ...map,
        total,
        starterCoverage: map.stock,
        proCoverage: map.stock + map.etf + map.forex,
        premiumCoverage: total,
      };
    },
    placeholderData: EMPTY,
  });
}

export function formatCount(n: number | undefined | null): string {
  if (!n || n <= 0) return "—";
  return n.toLocaleString("en-US");
}
