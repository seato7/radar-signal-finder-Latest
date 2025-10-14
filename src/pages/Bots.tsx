import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Bots = () => {
  const { toast } = useToast();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  const [bots, setBots] = useState([
    { id: "1", name: "Grid Bot AAPL", strategy: "grid", status: "running", pnl: 245.50, win_rate: 68.5 },
    { id: "2", name: "Momentum SPY", strategy: "momentum", status: "paused", pnl: -32.10, win_rate: 45.2 },
  ]);
  
  const [formData, setFormData] = useState({
    name: "",
    strategy: "grid",
    tickers: "",
    params: {}
  });

  const handleCreate = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/bots/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tickers: formData.tickers.split(',').map(t => t.trim()),
        })
      });
      
      if (response.ok) {
        toast({ title: "Bot created successfully" });
        setFormData({ name: "", strategy: "grid", tickers: "", params: {} });
      }
    } catch (error) {
      toast({ title: "Failed to create bot", variant: "destructive" });
    }
  };

  const handleBotAction = async (botId: string, action: string) => {
    try {
      await fetch(`${API_BASE}/api/bots/${botId}/${action}`, { method: 'POST' });
      toast({ title: `Bot ${action}ed` });
    } catch (error) {
      toast({ title: `Failed to ${action} bot`, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading Bots (Paper Mode)"
        description="Automated strategies running on simulated paper trading"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Create New Bot</CardTitle>
            <CardDescription>Configure and deploy a paper trading bot</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bot-name">Bot Name</Label>
              <Input
                id="bot-name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="My Grid Bot"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <Select value={formData.strategy} onValueChange={(v) => setFormData({...formData, strategy: v})}>
                <SelectTrigger id="strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid Trading</SelectItem>
                  <SelectItem value="momentum">Momentum</SelectItem>
                  <SelectItem value="dca">Dollar Cost Average</SelectItem>
                  <SelectItem value="meanrev">Mean Reversion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tickers">Tickers (comma-separated)</Label>
              <Input
                id="tickers"
                value={formData.tickers}
                onChange={(e) => setFormData({...formData, tickers: e.target.value})}
                placeholder="AAPL, MSFT, SPY"
              />
            </div>

            <Button onClick={handleCreate} className="w-full">
              Create Bot
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Active Bots</CardTitle>
            <CardDescription>Manage your paper trading bots</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bots.map((bot) => (
              <div key={bot.id} className="p-4 rounded-md bg-muted/50 border border-border space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-foreground">{bot.name}</div>
                    <div className="text-sm text-muted-foreground capitalize">{bot.strategy}</div>
                  </div>
                  <Badge variant={bot.status === "running" ? "default" : "secondary"}>
                    {bot.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">P&L</div>
                    <div className={`font-medium flex items-center gap-1 ${bot.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {bot.pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      ${Math.abs(bot.pnl).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Win Rate</div>
                    <div className="font-medium text-foreground">{bot.win_rate}%</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {bot.status === "running" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleBotAction(bot.id, "pause")}>
                        <Pause className="h-3 w-3 mr-1" />
                        Pause
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleBotAction(bot.id, "stop")}>
                        <Square className="h-3 w-3 mr-1" />
                        Stop
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleBotAction(bot.id, "start")}>
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  )}
                  <Button size="sm" variant="outline">
                    <Activity className="h-3 w-3 mr-1" />
                    View Logs
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Bots;
