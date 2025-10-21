import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

const opportunities = [
  {
    id: "1",
    asset: "BTC/USD",
    score: 94.2,
    themes: ["Momentum", "Volume"],
    signal: "Strong bullish divergence",
    updated: "2m ago",
  },
  {
    id: "2",
    asset: "ETH/USD",
    score: 89.7,
    themes: ["Sentiment", "Technical"],
    signal: "Positive sentiment surge",
    updated: "8m ago",
  },
  {
    id: "3",
    asset: "SOL/USD",
    score: 87.4,
    themes: ["Volume", "DeFi"],
    signal: "Unusual volume activity",
    updated: "15m ago",
  },
  {
    id: "4",
    asset: "MATIC/USD",
    score: 84.1,
    themes: ["Layer2", "Technical"],
    signal: "Breakout pattern forming",
    updated: "22m ago",
  },
];

const Radar = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredOpps, setFilteredOpps] = useState(opportunities);
  
  useEffect(() => {
    const filtered = opportunities.filter(opp => 
      opp.asset.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.signal.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.themes.some(theme => theme.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredOpps(filtered);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunity Radar"
        description="Live scanning for high-probability signals"
      />

      <Card className="shadow-data">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets or themes..."
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
          {filteredOpps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No opportunities found matching "{searchTerm}"
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOpps.map((opp) => (
                <Link
                  key={opp.id}
                  to={`/asset?ticker=${opp.asset.split('/')[0]}`}
                  className="block"
                >
                <div className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-lg text-foreground">{opp.asset}</h3>
                        <Badge variant="outline" className="bg-gradient-chrome text-primary-foreground border-0">
                          Score: {opp.score}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{opp.signal}</p>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 flex-wrap">
                      {opp.themes.map((theme) => (
                        <Badge key={theme} variant="secondary" className="text-xs">
                          {theme}
                        </Badge>
                      ))}
                      {/* Component badges (top 3) */}
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                        PolicyMomentum
                      </Badge>
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                        FlowPressure
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{opp.updated}</span>
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

export default Radar;
