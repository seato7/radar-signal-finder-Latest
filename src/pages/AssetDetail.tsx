import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ExternalLink, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface WhereToBuy {
  name: string;
  url: string;
}

interface AssetData {
  ticker: string;
  exchange: string;
  name: string;
  where_to_buy: WhereToBuy[];
  signals: Array<{
    id: string;
    type: string;
    observed_at: string;
    citation: any;
  }>;
  themes: Array<{
    id: string;
    name: string;
  }>;
}

const AssetDetail = () => {
  const { ticker } = useParams<{ ticker: string }>();
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number>(92.5);
  const [ranking, setRanking] = useState<number>(12);
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const { toast } = useToast();

  useEffect(() => {
    const fetchAsset = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/assets/by-ticker/${ticker}`);
        const data = await response.json();
        setAsset(data);
      } catch (error) {
        console.error("Failed to fetch asset:", error);
      } finally {
        setLoading(false);
      }
    };

    if (ticker) {
      fetchAsset();
    }
  }, [ticker]);

  const handleAddToWatchlist = async () => {
    try {
      toast({
        title: "Added to Watchlist",
        description: `${ticker} has been added to your watchlist`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add to watchlist",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!asset) {
    return <div className="p-6">Asset not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${asset.ticker} - ${asset.name}`}
        description={`Exchange: ${asset.exchange}`}
        action={
          <Button 
            variant="outline" 
            className="shadow-chrome"
            onClick={handleAddToWatchlist}
          >
            <Star className="mr-2 h-4 w-4" />
            Add to Watchlist
          </Button>
        }
      />

      {/* Score and Ranking Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-data">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Current Score</div>
              <div className="text-4xl font-bold text-primary mb-2">{score}</div>
              <Badge variant="outline" className="border-success text-success">
                <TrendingUp className="mr-1 h-3 w-3" />
                +2.3 (24h)
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Ranking</div>
              <div className="text-4xl font-bold text-foreground mb-2">#{ranking}</div>
              <div className="text-sm text-muted-foreground">Out of 500 assets</div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Signal Strength</div>
              <div className="text-4xl font-bold text-foreground mb-2">85%</div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                <div className="h-full bg-gradient-chrome" style={{ width: "85%" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-data lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
            <CardDescription>Latest activity for this asset</CardDescription>
          </CardHeader>
          <CardContent>
            {asset.signals.length > 0 ? (
              <div className="space-y-3">
                {asset.signals.slice(0, 10).map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                    <div>
                      <div className="font-medium text-foreground">{signal.type}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(signal.observed_at), { addSuffix: true })}
                      </div>
                    </div>
                    {signal.citation?.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={signal.citation.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent signals</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-data">
            <CardHeader>
              <CardTitle className="text-base">Associated Themes</CardTitle>
            </CardHeader>
            <CardContent>
              {asset.themes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {asset.themes.map((theme) => (
                    <Link key={theme.id} to="/themes">
                      <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                        {theme.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No themes</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-data">
            <CardHeader>
              <CardTitle className="text-base">Where to Buy (AU)</CardTitle>
              <CardDescription>AU-friendly brokers and exchanges</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {asset.where_to_buy.map((broker, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="w-full justify-between"
                  asChild
                >
                  <a href={broker.url} target="_blank" rel="noopener noreferrer">
                    {broker.name}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AssetDetail;
