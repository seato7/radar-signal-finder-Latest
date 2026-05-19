import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Star, Trash2, ExternalLink, Loader2, Search as SearchIcon } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPlanLimits } from "@/lib/planLimits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { TickerLink } from "@/lib/tickerLink";
import { cn } from "@/lib/utils";
import { AssetPickerModal } from "@/components/AssetPickerModal";

const Watchlist = () => {
  const [tickers, setTickers] = useState<string[]>([]);
  const [watchlistId, setWatchlistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmRemove2, _unused] = useState<null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { toast } = useToast();
  const { user, isAuthenticated, userPlan } = useAuth();
  const slotsLimit = getPlanLimits(userPlan).watchlist_slots;

  useEffect(() => {
    const fetchWatchlist = async () => {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("watchlist")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setWatchlistId(data.id);
          setTickers(data.tickers || []);
        }
      } catch (error) {
        console.error("Failed to fetch watchlist:", error);
        toast({ title: "Error", description: "Failed to load watchlist", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchWatchlist();
  }, [isAuthenticated, user]);

  const handleAdd = async () => {
    if (!newTicker.trim()) {
      toast({ title: "Error", description: "Please enter a ticker symbol", variant: "destructive" });
      return;
    }
    if (!isAuthenticated || !user) return;
    const tickerToAdd = newTicker.toUpperCase().trim();

    if (slotsLimit !== -1 && tickers.length >= slotsLimit) {
      toast({
        title: "Watchlist limit reached",
        description: slotsLimit === 0
          ? "Upgrade to a paid plan to use the watchlist."
          : `Your plan allows ${slotsLimit} assets. Upgrade to add more.`,
        variant: "destructive",
      });
      return;
    }
    if (tickers.includes(tickerToAdd)) {
      toast({ title: "Already added", description: `${tickerToAdd} is already in your watchlist`, variant: "destructive" });
      return;
    }

    setAdding(true);
    try {
      const newTickers = [...tickers, tickerToAdd];
      if (watchlistId) {
        const { error } = await supabase
          .from("watchlist")
          .update({ tickers: newTickers, updated_at: new Date().toISOString() })
          .eq("id", watchlistId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("watchlist")
          .insert({ user_id: user.id, tickers: newTickers })
          .select()
          .single();
        if (error) throw error;
        setWatchlistId(data.id);
      }
      setTickers(newTickers);
      setNewTicker("");
      setDialogOpen(false);
      toast({ title: "Added to Watchlist", description: `${tickerToAdd} has been added` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (tickerToRemove: string) => {
    if (!watchlistId) return;
    try {
      const newTickers = tickers.filter((t) => t !== tickerToRemove);
      const { error } = await supabase
        .from("watchlist")
        .update({ tickers: newTickers, updated_at: new Date().toISOString() })
        .eq("id", watchlistId);
      if (error) throw error;
      setTickers(newTickers);
      toast({ title: "Removed", description: `${tickerToRemove} removed from watchlist` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove", variant: "destructive" });
    } finally {
      setConfirmRemove(null);
    }
  };

  const filtered = useMemo(
    () => tickers.filter((t) => t.toLowerCase().includes(query.toLowerCase().trim())),
    [tickers, query]
  );

  // Plan limit indicator state
  const usagePct = slotsLimit > 0 ? (tickers.length / slotsLimit) * 100 : 0;
  const limitBorderClass =
    slotsLimit === -1
      ? "border-ds-border"
      : tickers.length >= slotsLimit
      ? "border-ds-signal-negative text-ds-signal-negative"
      : usagePct >= 80
      ? "border-ds-signal-warning text-ds-signal-warning"
      : "border-ds-border text-ds-text-secondary";

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <PageHeader title="Watchlist" description="Track your selected opportunities" />
        <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-8 text-center">
          <p className="text-ds-text-secondary">Please log in to view and manage your watchlist.</p>
          <Button asChild className="mt-4">
            <Link to="/auth">Log In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Watchlist"
          description="Track your selected opportunities at a glance."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Star className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          }
        />

        <AssetPickerModal
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          existingTickers={tickers}
          slotsLimit={slotsLimit}
          onAdded={(t) => setTickers((prev) => (prev.includes(t) ? prev : [...prev, t]))}
        />

        {/* Meta row: count + plan limit pill + search */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-caption font-mono text-ds-text-muted">
            {tickers.length} saved
          </span>
          <span
            className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-mono border bg-ds-surface",
              limitBorderClass
            )}
          >
            {slotsLimit === -1
              ? `${tickers.length} / ∞ slots`
              : `${tickers.length} / ${slotsLimit} slots used`}
          </span>

          {tickers.length > 0 && (
            <div className="ml-auto relative w-full sm:w-auto sm:min-w-[260px]">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker..."
                className="pl-9 bg-ds-surface border-ds-border placeholder:text-ds-text-muted"
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-ds-brand-primary" />
              <p className="text-ds-text-secondary mt-2">Loading watchlist...</p>
            </div>
          ) : tickers.length === 0 ? (
            <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-12 text-center flex flex-col items-center">
              <Star className="h-12 w-12 text-ds-text-muted mb-4" />
              <p className="text-body-lg font-semibold text-ds-text-primary">
                Your watchlist is empty
              </p>
              <p className="text-body text-ds-text-secondary mt-2 max-w-md">
                Tap the star on any asset to start tracking it here.
              </p>
              <Button asChild className="mt-6">
                <Link to="/asset-radar">Browse Asset Radar</Link>
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-8 text-center">
              <p className="text-ds-text-secondary">No tickers match "{query}".</p>
            </div>
          ) : (
            filtered.map((ticker) => (
              <div
                key={ticker}
                className="bg-ds-surface border border-ds-border rounded-ds-lg p-4 hover:border-ds-border-strong hover:shadow-ds-lg transition-all duration-fast ease-ds-out group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-ds-brand-primary text-body-lg">
                      <TickerLink ticker={ticker} />
                    </span>
                    <Link
                      to={`/asset/${ticker}`}
                      className="text-ds-text-muted hover:text-ds-text-secondary transition-colors"
                      aria-label={`Open ${ticker} details`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-ds-text-muted hover:text-ds-signal-negative"
                          onClick={() => setConfirmRemove(ticker)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove from watchlist</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <AlertDialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {confirmRemove} from watchlist?
              </AlertDialogTitle>
              <AlertDialogDescription>
                You can re-add it from Asset Radar at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-ds-text-secondary">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmRemove && handleRemove(confirmRemove)}
                className="bg-ds-signal-negative text-white hover:bg-ds-signal-negative/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default Watchlist;
