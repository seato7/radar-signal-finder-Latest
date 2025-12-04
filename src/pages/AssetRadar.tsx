import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AssetWithScore {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  asset_class: string | null;
  score: number;
  sentiment: string;
}

// Generate deterministic score based on ticker for consistency
const getAssetScore = (ticker: string): number => {
  const hash = ticker.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
  return Math.round((hash % 100) * 10) / 10;
};

const getSentiment = (score: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
  if (score >= 80) return { label: "Strong Bullish", variant: "default" };
  if (score >= 60) return { label: "Bullish", variant: "secondary" };
  if (score >= 40) return { label: "Neutral", variant: "outline" };
  if (score >= 20) return { label: "Bearish", variant: "destructive" };
  return { label: "Strong Bearish", variant: "destructive" };
};

const AssetRadar = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [assets, setAssets] = useState<AssetWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('assets')
          .select('*', { count: 'exact' });

        if (searchTerm) {
          query = query.or(`ticker.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,exchange.ilike.%${searchTerm}%`);
        }

        const { data, error, count } = await query.order('ticker').limit(50);

        if (error) throw error;

        // Enhance assets with computed scores
        const enhancedAssets: AssetWithScore[] = (data || []).map((asset) => {
          const score = getAssetScore(asset.ticker);
          const sentiment = getSentiment(score);
          
          return {
            id: asset.id,
            ticker: asset.ticker,
            name: asset.name,
            exchange: asset.exchange,
            asset_class: asset.asset_class,
            score,
            sentiment: sentiment.label
          };
        });

        // Sort by score descending
        enhancedAssets.sort((a, b) => b.score - a.score);
        
        setAssets(enhancedAssets);
        setTotal(count || 0);
      } catch (error) {
        console.error("Failed to fetch assets:", error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchAssets, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Radar"
        description={`Browse all ${total.toLocaleString()} stocks and cryptocurrencies`}
      />

      <Card className="shadow-data">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ticker, name, or exchange..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-4 rounded-lg border border-border">
                  <Skeleton className="h-6 w-20 mb-2" />
                  <Skeleton className="h-4 w-32 mb-3" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? `No assets found matching "${searchTerm}"` : "No assets available"}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => {
                const sentiment = getSentiment(asset.score);
                return (
                  <Link
                    key={asset.id}
                    to={`/asset/${encodeURIComponent(asset.ticker)}`}
                    className="block"
                  >
                    <div className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors h-full">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-lg text-primary">{asset.ticker}</h3>
                        <div className="flex items-center gap-2">
                          <Badge variant={sentiment.variant} className="text-xs">
                            {asset.score}
                          </Badge>
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{asset.name}</p>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary text-primary-foreground">
                          {asset.exchange}
                        </Badge>
                        <span className={`text-xs ${sentiment.variant === 'default' ? 'text-primary' : sentiment.variant === 'destructive' ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {asset.sentiment}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetRadar;
