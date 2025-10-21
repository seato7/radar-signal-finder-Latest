import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
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
  const [items, setItems] = useState(watchlistItems);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const { toast } = useToast();

  const handleAdd = () => {
    if (!newTicker.trim()) {
      toast({
        title: "Error",
        description: "Please enter a ticker symbol",
        variant: "destructive"
      });
      return;
    }

    const newItem = {
      id: String(items.length + 1),
      asset: newTicker.toUpperCase(),
      addedAt: new Date().toISOString().split('T')[0],
      currentScore: 0,
      notes: newNotes || "No notes"
    };

    setItems([...items, newItem]);
    setNewTicker("");
    setNewNotes("");
    setDialogOpen(false);
    
    toast({
      title: "Added to Watchlist",
      description: `${newItem.asset} has been added to your watchlist`
    });
  };

  const handleRemove = (id: string, asset: string) => {
    setItems(items.filter(item => item.id !== id));
    toast({
      title: "Removed",
      description: `${asset} has been removed from your watchlist`
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist"
        description="Track your selected opportunities"
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
                  Enter the ticker symbol and optional notes
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="ticker">Ticker Symbol</Label>
                  <Input
                    id="ticker"
                    placeholder="BTC, ETH, SOL..."
                    value={newTicker}
                    onChange={(e) => setNewTicker(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Input
                    id="notes"
                    placeholder="Your notes..."
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAdd} className="bg-gradient-chrome text-primary-foreground">
                  Add to Watchlist
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-3">
        {items.length === 0 ? (
          <Card className="shadow-data">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Your watchlist is empty. Add assets to start tracking them.</p>
            </CardContent>
          </Card>
        ) : (
          items.map((item) => (
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
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/asset/${item.asset.split('/')[0]}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemove(item.id, item.asset)}
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
