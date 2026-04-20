import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Trash2, Eye, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPlanLimits } from "@/lib/planLimits";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WatchlistData {
  id: string;
  user_id: string;
  tickers: string[];
  created_at: string;
  updated_at: string;
}

const Watchlist = () => {
  const [tickers, setTickers] = useState<string[]>([]);
  const [watchlistId, setWatchlistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();
  const { user, isAuthenticated, userPlan } = useAuth();
  const slotsLimit = getPlanLimits(userPlan).watchlist_slots;

  // Fetch watchlist from database
  useEffect(() => {
    const fetchWatchlist = async () => {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('watchlist')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;
        
        if (data) {
          setWatchlistId(data.id);
          setTickers(data.tickers || []);
        }
      } catch (error) {
        console.error("Failed to fetch watchlist:", error);
        toast({
          title: "Error",
          description: "Failed to load watchlist",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchWatchlist();
  }, [isAuthenticated, user]);

  const handleAdd = async () => {
    if (!newTicker.trim()) {
      toast({
        title: "Error",
        description: "Please enter a ticker symbol",
        variant: "destructive"
      });
      return;
    }

    if (!isAuthenticated || !user) {
      toast({
        title: "Authentication required",
        description: "Please log in to add items to your watchlist",
        variant: "destructive"
      });
      return;
    }

    const tickerToAdd = newTicker.toUpperCase().trim();

    if (slotsLimit !== -1 && tickers.length >= slotsLimit) {
      toast({
        title: "Watchlist limit reached",
        description: slotsLimit === 0
          ? "Upgrade to a paid plan to use the watchlist."
          : `Your plan allows ${slotsLimit} assets. Upgrade to add more.`,
        variant: "destructive"
      });
      return;
    }

    if (tickers.includes(tickerToAdd)) {
      toast({
        title: "Already added",
        description: `${tickerToAdd} is already in your watchlist`,
        variant: "destructive"
      });
      return;
    }

    setAdding(true);
    try {
      const newTickers = [...tickers, tickerToAdd];
      
      if (watchlistId) {
        // Update existing watchlist
        const { error } = await supabase
          .from('watchlist')
          .update({ tickers: newTickers, updated_at: new Date().toISOString() })
          .eq('id', watchlistId);

        if (error) throw error;
      } else {
        // Create new watchlist
        const { data, error } = await supabase
          .from('watchlist')
          .insert({
            user_id: user.id,
            tickers: newTickers
          })
          .select()
          .single();

        if (error) throw error;
        setWatchlistId(data.id);
      }

      setTickers(newTickers);
      setNewTicker("");
      setDialogOpen(false);
      
      toast({
        title: "Added to Watchlist",
        description: `${tickerToAdd} has been added to your watchlist`
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add to watchlist",
        variant: "destructive"
      });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (tickerToRemove: string) => {
    if (!watchlistId) return;
    
    try {
      const newTickers = tickers.filter(t => t !== tickerToRemove);
      
      const { error } = await supabase
        .from('watchlist')
        .update({ tickers: newTickers, updated_at: new Date().toISOString() })
        .eq('id', watchlistId);

      if (error) throw error;

      setTickers(newTickers);
      toast({
        title: "Removed",
        description: `${tickerToRemove} has been removed from your watchlist`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove from watchlist",
        variant: "destructive"
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Watchlist"
          description="Track your selected opportunities"
        />
        <Card className="shadow-data">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Please log in to view and manage your watchlist.</p>
            <Button asChild className="mt-4">
              <Link to="/auth">Log In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist"
        description={slotsLimit === -1
          ? "Track your selected opportunities"
          : slotsLimit === 0
            ? "Track your selected opportunities. Upgrade to add assets"
            : `Track your selected opportunities (${tickers.length} / ${slotsLimit} slots used)`
        }
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-chrome text-primary-foreground">
                <Star className="mr-2 h-4 w-4" />
                Add Asset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Asset to Watchlist</DialogTitle>
                <DialogDescription>
                  Enter the ticker symbol to track
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="ticker">Ticker Symbol</Label>
                  <Input
                    id="ticker"
                    placeholder="BTC, ETH, AAPL..."
                    value={newTicker}
                    onChange={(e) => setNewTicker(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  onClick={handleAdd} 
                  disabled={adding}
                  className="bg-gradient-chrome text-primary-foreground"
                >
                  {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Add to Watchlist
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-3">
        {loading ? (
          <Card className="shadow-data">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground mt-2">Loading watchlist...</p>
            </CardContent>
          </Card>
        ) : tickers.length === 0 ? (
          <Card className="shadow-data">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Your watchlist is empty. Add assets to start tracking them.</p>
            </CardContent>
          </Card>
        ) : (
          tickers.map((ticker) => (
            <Card key={ticker} className="shadow-data">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">{ticker}</h3>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/asset/${ticker}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemove(ticker)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Watchlist;