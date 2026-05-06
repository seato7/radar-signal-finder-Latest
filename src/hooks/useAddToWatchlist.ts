import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getPlanLimits } from "@/lib/planLimits";

/**
 * Shared hook for adding a ticker to the current user's watchlist row.
 * Mirrors the read-existing / append / upsert pattern used on /watchlist.
 */
export function useAddToWatchlist() {
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();
  const { user, isAuthenticated, userPlan } = useAuth();

  const addTicker = async (rawTicker: string): Promise<boolean> => {
    const ticker = rawTicker?.toUpperCase().trim();
    if (!ticker) return false;

    if (!isAuthenticated || !user) {
      toast({
        title: "Authentication required",
        description: "Please log in to add items to your watchlist",
        variant: "destructive",
      });
      return false;
    }

    setAdding(true);
    try {
      const slotsLimit = getPlanLimits(userPlan).watchlist_slots;

      // Read existing row
      const { data: existing, error: readErr } = await supabase
        .from("watchlist")
        .select("id, tickers")
        .eq("user_id", user.id)
        .maybeSingle();

      if (readErr) throw readErr;

      const currentTickers: string[] = existing?.tickers ?? [];

      if (currentTickers.includes(ticker)) {
        toast({
          title: "Already added",
          description: `${ticker} is already in your watchlist`,
        });
        return false;
      }

      if (slotsLimit !== -1 && currentTickers.length >= slotsLimit) {
        toast({
          title: "Watchlist limit reached",
          description:
            slotsLimit === 0
              ? "Upgrade to a paid plan to use the watchlist."
              : `Your plan allows ${slotsLimit} assets. Upgrade to add more.`,
          variant: "destructive",
        });
        return false;
      }

      const newTickers = [...currentTickers, ticker];

      if (existing?.id) {
        const { error } = await supabase
          .from("watchlist")
          .update({ tickers: newTickers, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("watchlist")
          .insert({ user_id: user.id, tickers: newTickers });
        if (error) throw error;
      }

      toast({
        title: "Added to Watchlist",
        description: `${ticker} has been added to your watchlist`,
      });
      return true;
    } catch (err: any) {
      // Surface DB plan-limit trigger errors nicely
      const msg: string = err?.message || "Failed to add to watchlist";
      const friendly = msg.includes("plan_limit_reached")
        ? "Watchlist limit reached for your plan. Upgrade to add more."
        : msg;
      toast({
        title: "Error",
        description: friendly,
        variant: "destructive",
      });
      return false;
    } finally {
      setAdding(false);
    }
  };

  return { addTicker, adding };
}
