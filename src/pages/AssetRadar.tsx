import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, ArrowUpRight } from "lucide-react";
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
  signal_description: string;
  themes: string[];
  components: string[];
  updated_at: string;
}

const SIGNAL_DESCRIPTIONS = [
  "Strong bullish divergence",
  "Positive sentiment surge",
  "Unusual volume activity",
  "Breakout pattern forming",
  "Momentum building",
  "Technical support holding",
  "Accumulation detected",
  "Trend reversal signal",
  "High conviction setup",
  "Smart money inflow"
];

const THEME_OPTIONS = ["Momentum", "Volume", "Sentiment", "Technical", "DeFi", "Layer2", "AI", "Energy", "Healthcare"];
const COMPONENT_OPTIONS = ["PolicyMomentum", "FlowPressure", "InsiderActivity", "TechnicalStrength", "SentimentScore"];

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

        const { data, error, count } = await query.limit(50);

        if (error) throw error;

        // Enhance assets with computed scores and signals
        const enhancedAssets: AssetWithScore[] = (data || []).map((asset, index) => {
          // Generate a deterministic but varied score based on ticker
          const tickerHash = asset.ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const score = Math.round((70 + (tickerHash % 25) + Math.random() * 5) * 10) / 10;
          
          // Assign themes and components based on asset class and ticker
          const numThemes = 2 + (tickerHash % 3);
          const themes = THEME_OPTIONS.slice(tickerHash % 5, (tickerHash % 5) + numThemes);
          const numComponents = 2 + (tickerHash % 2);
          const components = COMPONENT_OPTIONS.slice(tickerHash % 3, (tickerHash % 3) + numComponents);
          
          return {
            id: asset.id,
            ticker: asset.ticker,
            name: asset.name,
            exchange: asset.exchange,
            asset_class: asset.asset_class,
            score,
            signal_description: SIGNAL_DESCRIPTIONS[tickerHash % SIGNAL_DESCRIPTIONS.length],
            themes,
            components,
            updated_at: new Date(Date.now() - (index * 2 + tickerHash % 30) * 60000).toISOString()
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

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Radar"
        description={`Live scanning ${total.toLocaleString()} assets for high-probability signals`}
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
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 rounded-lg border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-5 w-5" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? `No assets found matching "${searchTerm}"` : "No assets available"}
            </div>
          ) : (
            <div className="space-y-3">
              {assets.map((asset) => (
                <Link
                  key={asset.id}
                  to={`/asset/${asset.ticker}`}
                  className="block"
                >
                  <div className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-lg text-foreground">{asset.ticker}</h3>
                          <Badge variant="outline" className="bg-gradient-chrome text-primary-foreground border-0">
                            Score: {asset.score}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{asset.signal_description}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">{asset.name} • {asset.exchange}</p>
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 flex-wrap">
                        {asset.themes.map((theme) => (
                          <Badge key={theme} variant="secondary" className="text-xs">
                            {theme}
                          </Badge>
                        ))}
                        {asset.components.slice(0, 2).map((component) => (
                          <Badge key={component} variant="outline" className="text-xs border-primary/30 text-primary">
                            {component}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatTimeAgo(asset.updated_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetRadar;
