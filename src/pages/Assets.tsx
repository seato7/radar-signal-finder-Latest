import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface Asset {
  id: string;
  ticker: string;
  exchange: string;
  name: string;
}

const Assets = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [total, setTotal] = useState(0);
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // Assets are now auto-populated by backend on startup

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.append('limit', '500');
        if (searchTerm) {
          params.append('search', searchTerm);
        }
        
        const response = await fetch(`${API_BASE}/api/assets?${params}`);
        const data = await response.json();
        setAssets(data.assets || []);
        setTotal(data.total || 0);
      } catch (error) {
        console.error("Failed to fetch assets:", error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      fetchAssets();
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchTerm]);

  const getExchangeBadgeColor = (exchange: string) => {
    const ex = exchange.toUpperCase();
    if (ex.includes('NASDAQ') || ex.includes('NYSE')) return 'default';
    if (ex.includes('ASX')) return 'secondary';
    if (ex.includes('CRYPTO')) return 'outline';
    return 'default';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset View"
        description={`Browse all ${total} stocks and cryptocurrencies`}
      />

      {/* Search Bar */}
      <Card className="shadow-data">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ticker, name, or exchange..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Assets Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="shadow-data">
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-full mb-3" />
                <Skeleton className="h-5 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <Card className="shadow-data">
          <CardContent className="pt-6 text-center text-muted-foreground">
            No assets found. Try a different search term or run the data ingest pipeline.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <Link key={asset.id} to={`/asset/${asset.ticker}`}>
              <Card className="shadow-data hover:shadow-chrome transition-all cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xl font-bold text-primary mb-1">
                        {asset.ticker}
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {asset.name}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getExchangeBadgeColor(asset.exchange)}>
                      {asset.exchange}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Load More - Future Enhancement */}
      {!loading && assets.length > 0 && assets.length < total && (
        <div className="flex justify-center">
          <Button variant="outline">
            Load More ({total - assets.length} remaining)
          </Button>
        </div>
      )}
    </div>
  );
};

export default Assets;
