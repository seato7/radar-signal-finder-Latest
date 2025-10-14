import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Trash2, Eye } from "lucide-react";

const watchlistItems = [
  {
    id: "1",
    asset: "BTC/USD",
    addedAt: "2024-01-15",
    currentScore: 94.2,
    notes: "Strong momentum play",
  },
  {
    id: "2",
    asset: "ETH/USD",
    addedAt: "2024-01-14",
    currentScore: 89.7,
    notes: "Layer 2 expansion thesis",
  },
  {
    id: "3",
    asset: "SOL/USD",
    addedAt: "2024-01-10",
    currentScore: 87.4,
    notes: "DeFi recovery narrative",
  },
];

const Watchlist = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist"
        description="Track your selected opportunities"
        action={
          <Button className="bg-gradient-chrome text-primary-foreground">
            <Star className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        }
      />

      <div className="space-y-3">
        {watchlistItems.map((item) => (
          <Card key={item.id} className="shadow-data">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-foreground">{item.asset}</h3>
                    <Badge variant="outline" className="border-primary text-primary">
                      Score: {item.currentScore}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{item.notes}</p>
                  <p className="text-xs text-muted-foreground">
                    Added: {new Date(item.addedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Watchlist;
