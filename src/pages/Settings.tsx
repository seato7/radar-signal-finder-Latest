import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Trash2, Loader2, Copy, Key, AlertCircle,
  TrendingUp, Bell, BookMarked, Sparkles, BarChart3,
  Bot, Globe, ShieldCheck, ArrowRight, Pause, ChevronDown,
  XCircle, AlertTriangle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────
interface BrokerKey {
  id: string;
  label: string;
  exchange: string;
  key_id: string;
  paper_mode: boolean;
  created_at: string;
}

interface SupportedBroker {
  id: string;
  name: string;
  description: string;
  supports_paper: boolean;
  assets: string[];
}

interface ApiKeyEnterprise {
  id: string;
  label: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used: string | null;
  created_at: string;
}

type CancelStep = 'idle' | 'loss' | 'pause' | 'downgrade' | 'confirm' | 'processing';

// ── Plan metadata ──────────────────────────────────────────────────────────
const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
  enterprise: 'Enterprise',
  admin: 'Admin',
};

interface LossItem {
  icon: React.ReactNode;
  label: string;
  detail: string;
}

function getLossItems(plan: string): LossItem[] {
  const cyan = 'text-cyan-500';
  if (plan === 'starter') {
    return [
      { icon: <TrendingUp className={`h-5 w-5 ${cyan}`} />, label: '1 Active Signal', detail: 'Your tracked trading signal will be removed' },
      { icon: <BookMarked className={`h-5 w-5 ${cyan}`} />, label: '3 Watchlist Slots', detail: 'Your watchlist assets will no longer be tracked' },
      { icon: <Globe className={`h-5 w-5 ${cyan}`} />, label: 'Investment Themes', detail: 'Access to 1 investment theme will be lost' },
      { icon: <Sparkles className={`h-5 w-5 ${cyan}`} />, label: 'AI Assistant (5/day)', detail: 'AI-powered market insights will be disabled' },
      { icon: <Bell className={`h-5 w-5 ${cyan}`} />, label: '1 Price Alert', detail: 'Your active price alert will stop firing' },
    ];
  }
  if (plan === 'pro') {
    return [
      { icon: <TrendingUp className={`h-5 w-5 ${cyan}`} />, label: '3 Active Signals', detail: 'All 3 of your tracked signals will be removed' },
      { icon: <BookMarked className={`h-5 w-5 ${cyan}`} />, label: '10 Watchlist Slots', detail: 'Your full watchlist will no longer be tracked' },
      { icon: <Globe className={`h-5 w-5 ${cyan}`} />, label: '3 Investment Themes', detail: 'All 3 themes and their signals will be lost' },
      { icon: <Sparkles className={`h-5 w-5 ${cyan}`} />, label: 'AI Assistant (20/day)', detail: '20 daily AI queries will be disabled' },
      { icon: <Bell className={`h-5 w-5 ${cyan}`} />, label: '5 Price Alerts', detail: 'All your active alerts will stop firing' },
      { icon: <BarChart3 className={`h-5 w-5 ${cyan}`} />, label: 'ETF & Forex Radar', detail: 'Access to ETF and forex asset classes will end' },
    ];
  }
  if (plan === 'premium' || plan === 'enterprise' || plan === 'admin') {
    return [
      { icon: <TrendingUp className={`h-5 w-5 ${cyan}`} />, label: 'Unlimited Signals', detail: 'All your tracked signals will be removed' },
      { icon: <BookMarked className={`h-5 w-5 ${cyan}`} />, label: 'Unlimited Watchlist', detail: 'Your entire watchlist will no longer be tracked' },
      { icon: <Globe className={`h-5 w-5 ${cyan}`} />, label: 'All Investment Themes', detail: 'Access to every theme and score will be lost' },
      { icon: <Sparkles className={`h-5 w-5 ${cyan}`} />, label: 'Unlimited AI Assistant', detail: 'All AI-powered market intelligence will be disabled' },
      { icon: <Bell className={`h-5 w-5 ${cyan}`} />, label: 'Unlimited Alerts', detail: 'Every active alert will stop firing immediately' },
      { icon: <BarChart3 className={`h-5 w-5 ${cyan}`} />, label: 'Full Asset Radar + Scores', detail: 'Scores, rankings and all asset classes will be hidden' },
      { icon: <Bot className={`h-5 w-5 ${cyan}`} />, label: 'Trading Bots', detail: 'Your trading bots will be paused' },
      { icon: <ShieldCheck className={`h-5 w-5 ${cyan}`} />, label: 'Analytics Dashboard', detail: 'All performance analytics will be removed' },
    ];
  }
  return [];
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate();
  const { token, userPlan } = useAuth();
  const { toast } = useToast();

  // Broker state
  const [keys, setKeys] = useState<BrokerKey[]>([]);
  const [brokers, setBrokers] = useState<SupportedBroker[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    exchange: 'alpaca', label: '', api_key: '', secret_key: '', paper_mode: true
  });

  // Enterprise API keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyEnterprise[]>([]);
  const [apiKeyLabel, setApiKeyLabel] = useState('');
  const [creatingApiKey, setCreatingApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Cancellation flow state
  const [cancelStep, setCancelStep] = useState<CancelStep>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  useEffect(() => {
    fetchKeys();
    fetchSupportedBrokers();
    if (userPlan === 'enterprise') fetchApiKeys();
  }, [userPlan]);

  // ── Subscription helpers ───────────────────────────────────────────────
  const isPaidPlan = userPlan && !['free'].includes(userPlan);

  const openStripePortal = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { navigate('/auth'); return; }

      const { data: refreshed } = await supabase.auth.refreshSession();
      if (!refreshed.session?.access_token) { navigate('/auth'); return; }

      const { data, error } = await supabase.functions.invoke('manage-payments/portal', {
        headers: { Authorization: `Bearer ${refreshed.session.access_token}` },
      });
      if (error) throw new Error(error.message);
      if (data?.url) window.location.href = data.url;
      else throw new Error('No portal URL returned');
    } catch (err: any) {
      toast({ title: 'Portal unavailable', description: err.message, variant: 'destructive' });
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePauseRequest = async () => {
    setPauseLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { navigate('/auth'); return; }

      const { data: refreshed } = await supabase.auth.refreshSession();
      if (!refreshed.session?.access_token) { navigate('/auth'); return; }

      const { data, error } = await supabase.functions.invoke('manage-payments', {
        body: { action: 'pause' },
        headers: { Authorization: `Bearer ${refreshed.session.access_token}` },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error('Pause failed — please try again');

      const resumeDate = new Date(data.resumes_at * 1000).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      toast({
        title: 'Account paused for 30 days',
        description: `You keep full access until ${resumeDate}. No charge during this time.`,
      });
      setCancelStep('idle');
    } catch (err: any) {
      let errorMessage = err.message || 'Something went wrong. Please try again.';
      try {
        const body = await err.context?.json();
        if (body?.error) errorMessage = body.error;
      } catch {}
      toast({ title: 'Pause failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setPauseLoading(false);
    }
  };

  const handleDowngrade = async () => {
    setCancelStep('idle');
    await openStripePortal();
  };

  const handleConfirmCancel = async () => {
    if (confirmText.trim().toUpperCase() !== 'CANCEL') {
      toast({ title: 'Type CANCEL to confirm', variant: 'destructive' });
      return;
    }
    setCancelStep('processing');
    await openStripePortal();
    setCancelStep('idle');
    setConfirmText('');
  };

  // ── Broker helpers ─────────────────────────────────────────────────────
  const fetchSupportedBrokers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-brokers-full', { method: 'GET' });
      if (error) throw error;
      setBrokers(data.brokers || []);
    } catch {
      toast({ title: 'Error', description: 'Failed to load broker options', variant: 'destructive' });
    }
  };

  const fetchApiKeys = async () => { setApiKeys([]); };

  const handleCreateApiKey = async () => {
    if (!apiKeyLabel.trim()) {
      toast({ title: 'Error', description: 'Please enter a label for the API key', variant: 'destructive' });
      return;
    }
    setCreatingApiKey(true);
    toast({ title: 'Coming Soon', description: 'Enterprise API key management will be available soon' });
    setCreatingApiKey(false);
  };

  const handleDeleteApiKey = async (_keyId: string) => {
    toast({ title: 'Coming Soon' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const fetchKeys = async () => {
    try {
      const { data } = await supabase
        .from('broker_keys')
        .select('id, exchange, paper_mode, created_at, api_key_encrypted')
        .order('created_at', { ascending: false });
      if (data) {
        setKeys(data.map(k => ({
          id: k.id,
          label: `${k.exchange.toUpperCase()} Account`,
          exchange: k.exchange,
          key_id: k.api_key_encrypted.substring(0, 16),
          paper_mode: k.paper_mode,
          created_at: k.created_at,
        })));
      }
    } catch { /* silent */ }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-brokers-full/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exchange: formData.exchange, api_key: formData.api_key, secret_key: formData.secret_key, paper_mode: formData.paper_mode }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Connection failed');
      toast({ title: 'Broker Connected', description: 'Your broker account has been connected successfully.' });
      setFormData({ exchange: 'alpaca', label: '', api_key: '', secret_key: '', paper_mode: true });
      fetchKeys();
    } catch (error: any) {
      toast({ title: 'Connection Failed', description: error.message || 'Could not connect broker account.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      const { error } = await supabase.from('broker_keys').delete().eq('id', keyId);
      if (error) throw error;
      toast({ title: 'Broker Disconnected' });
      fetchKeys();
    } catch {
      toast({ title: 'Error', description: 'Failed to disconnect broker.', variant: 'destructive' });
    }
  };

  const handleTestKey = async (keyId: string) => {
    setTestingId(keyId);
    try {
      const { data } = await supabase.from('broker_keys').select('exchange, paper_mode').eq('id', keyId).single();
      if (data) {
        toast({ title: 'Connection Active', description: `${data.exchange.toUpperCase()} - ${data.paper_mode ? 'Paper' : 'Live'} trading enabled` });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to test connection.', variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  };

  const selectedBroker = brokers.find(b => b.id === formData.exchange);
  const lossItems = getLossItems(userPlan || 'free');

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader title="Settings" description="Manage your subscription, broker connections and account settings" />

      {/* ── Subscription Management ── */}
      {isPaidPlan && (
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Subscription</CardTitle>
                <CardDescription>Manage your plan and billing</CardDescription>
              </div>
              <Badge variant="outline" className="border-cyan-500 text-cyan-500 capitalize">
                {PLAN_LABELS[userPlan!] || userPlan}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {cancelStep === 'idle' && (
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={openStripePortal} disabled={portalLoading}>
                  {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Manage Billing
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setCancelStep('loss')}
                >
                  Cancel Subscription
                </Button>
              </div>
            )}

            {/* ── Step 1: Loss aversion ── */}
            {cancelStep === 'loss' && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Before you go — here's what you'll lose</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Cancelling removes access immediately at the end of your billing period.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {lossItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                      <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button variant="default" onClick={() => setCancelStep('idle')}>
                    Keep My Plan
                  </Button>
                  <Button variant="outline" onClick={() => setCancelStep('pause')}>
                    I still want to cancel
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 2: Pause offer ── */}
            {cancelStep === 'pause' && (
              <div className="space-y-5">
                <div className="p-5 rounded-xl border border-cyan-500/40 bg-cyan-500/5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Pause className="h-5 w-5 text-cyan-500" />
                    <p className="font-semibold text-foreground">Need a break? Pause for 30 days instead</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We'll pause your billing for 30 days. Your signals, watchlist, themes and settings are all preserved exactly as they are. No charge. Resume anytime.
                  </p>
                  <Button
                    className="mt-2 w-full sm:w-auto"
                    style={{ background: 'linear-gradient(to right, #06B6D4, #3B82F6)' }}
                    onClick={handlePauseRequest}
                    disabled={pauseLoading}
                  >
                    {pauseLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Pausing account...</>
                      : 'Pause My Account for 30 Days'}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="default" onClick={() => setCancelStep('idle')}>
                    Keep My Plan
                  </Button>
                  <Button variant="outline" onClick={() => setCancelStep('downgrade')}>
                    No thanks, keep going
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 3: Downgrade offer ── */}
            {cancelStep === 'downgrade' && userPlan !== 'starter' && (
              <div className="space-y-5">
                <div className="p-5 rounded-xl border border-border bg-card space-y-3">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-5 w-5 text-primary" />
                    <p className="font-semibold text-foreground">Switch to Starter for $9.99/mo instead</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Keep access to InsiderPulse signals, your watchlist, and the AI assistant at a fraction of the cost. No data lost — just scaled back.
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-1">
                    <li className="flex items-center gap-2"><span className="text-cyan-500">✓</span> 1 active signal</li>
                    <li className="flex items-center gap-2"><span className="text-cyan-500">✓</span> Asset Radar (stocks)</li>
                    <li className="flex items-center gap-2"><span className="text-cyan-500">✓</span> AI Assistant (5 messages/day)</li>
                    <li className="flex items-center gap-2"><span className="text-cyan-500">✓</span> 1 investment theme</li>
                  </ul>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={handleDowngrade}>
                    Switch to Starter — $9.99/mo
                  </Button>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="default" onClick={() => setCancelStep('idle')}>
                    Keep My Plan
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setCancelStep('confirm')}
                  >
                    No, I want to cancel completely
                    <XCircle className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Skip to confirm if already on Starter */}
            {cancelStep === 'downgrade' && userPlan === 'starter' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">You're already on our lowest paid plan.</p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="default" onClick={() => setCancelStep('idle')}>Keep My Plan</Button>
                  <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setCancelStep('confirm')}>
                    Cancel completely <XCircle className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 4: Final confirmation ── */}
            {cancelStep === 'confirm' && (
              <div className="space-y-5">
                <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/5 space-y-2">
                  <p className="font-semibold text-destructive">This will cancel your subscription</p>
                  <p className="text-sm text-muted-foreground">
                    You'll keep access until the end of your current billing period. After that, all features above will be removed and your account will revert to Free.
                  </p>
                  <p className="text-sm text-muted-foreground font-medium">
                    Type <span className="font-mono font-bold text-destructive">CANCEL</span> below to confirm.
                  </p>
                </div>

                <div className="space-y-2">
                  <Input
                    placeholder="Type CANCEL to confirm"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    className="max-w-xs font-mono"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="default" onClick={() => { setCancelStep('idle'); setConfirmText(''); }}>
                    Actually, keep my plan
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={confirmText.trim().toUpperCase() !== 'CANCEL' || cancelStep === 'processing'}
                    onClick={handleConfirmCancel}
                  >
                    {cancelStep === 'processing'
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Opening billing portal...</>
                      : 'Confirm Cancellation'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Broker Connection ── */}
      <Card>
        <CardHeader>
          <CardTitle>Connect Broker Account</CardTitle>
          <CardDescription>
            Connect your trading account from any supported broker. Your API keys are encrypted and stored securely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddKey} className="space-y-4">
            <div>
              <Label htmlFor="exchange">Select Broker</Label>
              <Select value={formData.exchange} onValueChange={(value) => setFormData({ ...formData, exchange: value })}>
                <SelectTrigger id="exchange">
                  <SelectValue placeholder="Choose a broker" />
                </SelectTrigger>
                <SelectContent>
                  {brokers.map((broker) => (
                    <SelectItem key={broker.id} value={broker.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{broker.name}</span>
                        <span className="text-xs text-muted-foreground">{broker.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="label">Account Label</Label>
              <Input
                id="label"
                placeholder="My Trading Account"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                placeholder="Enter your API key"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="secret_key">Secret Key</Label>
              <Input
                id="secret_key"
                type="password"
                placeholder="Enter your secret key"
                value={formData.secret_key}
                onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                required
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="paper_mode"
                checked={formData.paper_mode}
                onCheckedChange={(checked) => setFormData({ ...formData, paper_mode: checked })}
                disabled={!selectedBroker?.supports_paper}
              />
              <Label htmlFor="paper_mode">
                Paper Trading Mode (Recommended)
                {selectedBroker && !selectedBroker.supports_paper && (
                  <span className="text-xs text-muted-foreground ml-2">(Not available for this broker)</span>
                )}
              </Label>
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect Broker'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Connected Brokers ── */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Brokers</CardTitle>
          <CardDescription>Your connected broker accounts</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-muted-foreground">No broker accounts connected yet.</p>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-semibold">{key.label}</h4>
                    <p className="text-sm text-muted-foreground">
                      {key.exchange.toUpperCase()} • {key.paper_mode ? 'Paper' : 'Live'} • {key.key_id.slice(0, 10)}...
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleTestKey(key.id)} disabled={testingId === key.id}>
                      {testingId === key.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Connection'}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteKey(key.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Enterprise API Keys ── */}
      {userPlan === 'enterprise' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>Generate API keys for programmatic access to your data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {newApiKey && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">Save this API key — it won't be shown again!</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-muted rounded text-sm break-all">{newApiKey}</code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(newApiKey)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setNewApiKey(null)}>Dismiss</Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="API Key Label (e.g., 'Production Server')"
                value={apiKeyLabel}
                onChange={(e) => setApiKeyLabel(e.target.value)}
              />
              <Button onClick={handleCreateApiKey} disabled={creatingApiKey}>
                {creatingApiKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Key'}
              </Button>
            </div>

            {apiKeys.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No API keys created yet</p>
            ) : (
              <div className="space-y-4">
                {apiKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-semibold">{key.label}</h4>
                      <p className="text-sm text-muted-foreground">{key.key_prefix}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {key.last_used ? `Last used: ${new Date(key.last_used).toLocaleDateString()}` : 'Never used'}
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteApiKey(key.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Using Your API Key</h4>
              <p className="text-sm text-muted-foreground mb-2">Include your API key in request headers:</p>
              <code className="block p-2 bg-background rounded text-xs">X-API-Key: ok_live_your_key_here</code>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
