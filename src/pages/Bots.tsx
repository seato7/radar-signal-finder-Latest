import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, TrendingUp, TrendingDown, Activity, ArrowUpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Bots = () => {
  const { toast } = useToast();
  const { token, isAuthenticated } = useAuth();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    name: "",
    strategy: "grid",
    tickers: "",
    mode: "paper",
    params: {}
  });

  useEffect(() => {
    if (isAuthenticated) {
      fetchBots();
    }
  }, [isAuthenticated]);

  const fetchBots = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/bots`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBots(data);
      }
    } catch (error) {
      console.error('Error fetching bots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!isAuthenticated || !token) {
      toast({ 
        title: "Authentication required",
        description: "Please log in to create bots",
        variant: "destructive" 
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/bots/create`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          strategy: formData.strategy,
          mode: formData.mode,
          tickers: formData.tickers.split(',').map(t => t.trim()),
          params: formData.params
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({ title: "Bot created successfully" });
        setFormData({ name: "", strategy: "grid", tickers: "", mode: "paper", params: {} });
        fetchBots(); // Reload bots
      } else {
        console.error('Bot creation failed:', response.status, data);
        toast({ 
          title: "Failed to create bot", 
          description: data.detail || JSON.stringify(data) || "Unknown error",
          variant: "destructive" 
        });
      }
    } catch (error) {
      toast({ title: "Failed to create bot", variant: "destructive" });
    }
  };

  const handleBotAction = async (botId: string, action: string) => {
    if (!isAuthenticated || !token) {
      toast({ 
        title: "Authentication required",
        description: "Please log in to control bots",
        variant: "destructive" 
      });
      return;
    }

    try {
      await fetch(`${API_BASE}/api/bots/${botId}/${action}`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast({ title: `Bot ${action}ed` });
      fetchBots(); // Reload bots
    } catch (error) {
      toast({ title: `Failed to ${action} bot`, variant: "destructive" });
    }
  };

  const handleUpgradeToLive = async (botId: string) => {
    if (!isAuthenticated || !token) {
      toast({ 
        title: "Authentication required",
        variant: "destructive" 
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/bots/${botId}/upgrade_to_live`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({ 
          title: "Upgraded to live trading",
          description: "Bot is now using real money" 
        });
        fetchBots(); // Reload bots
      } else {
        toast({ 
          title: "Upgrade failed", 
          description: data.detail || "Unknown error",
          variant: "destructive" 
        });
      }
    } catch (error) {
      toast({ title: "Failed to upgrade bot", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading Bots"
        description="Manage your automated trading strategies - paper trading and live trading"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Create New Bot</CardTitle>
            <CardDescription>Configure and deploy a trading bot (paper or live)</CardDescription>
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

            <div className="space-y-2">
              <Label htmlFor="mode">Trading Mode</Label>
              <Select value={formData.mode} onValueChange={(v) => setFormData({...formData, mode: v})}>
                <SelectTrigger id="mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">Paper Trading (Simulated)</SelectItem>
                  <SelectItem value="live">Live Trading (Real Money)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.mode === "paper" 
                  ? "Practice with simulated trades" 
                  : "⚠️ Live mode requires Starter plan or higher and uses real money"}
              </p>
            </div>

            <Button onClick={handleCreate} className="w-full">
              Create Bot
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardHeader>
            <CardTitle>Active Bots</CardTitle>
            <CardDescription>Manage your trading bots</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading bots...</div>
            ) : bots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bots yet. Create your first bot!
              </div>
            ) : (
              bots.map((bot) => (
              <div key={bot.id} className="p-4 rounded-md bg-muted/50 border border-border space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-foreground">{bot.name}</div>
                    <div className="text-sm text-muted-foreground capitalize">{bot.strategy}</div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={bot.status === "running" ? "default" : "secondary"}>
                      {bot.status}
                    </Badge>
                    {bot.mode && (
                      <Badge variant={bot.mode === "live" ? "destructive" : "outline"}>
                        {bot.mode === "live" ? "LIVE" : "Paper"}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">P&L</div>
                    <div className={`font-medium flex items-center gap-1 ${(bot.pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {(bot.pnl || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      ${Math.abs(bot.pnl || 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Win Rate</div>
                    <div className="font-medium text-foreground">{bot.win_rate || 0}%</div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
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
                  {bot.mode === "paper" && (
                    <Button size="sm" variant="default" onClick={() => handleUpgradeToLive(bot.id)}>
                      <ArrowUpCircle className="h-3 w-3 mr-1" />
                      Upgrade to Live
                    </Button>
                  )}
                </div>
              </div>
            ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Bots;
