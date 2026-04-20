import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, TrendingUp, Bell, BookMarked, Sparkles, BarChart3,
  Bot, Globe, ShieldCheck, ArrowRight, Pause, ChevronDown,
  XCircle, AlertTriangle,
} from 'lucide-react';

type CancelStep = 'idle' | 'loss' | 'pause' | 'downgrade' | 'confirm' | 'processing';

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

export default function SettingsSubscription() {
  const navigate = useNavigate();
  const { userPlan } = useAuth();
  const { toast } = useToast();

  const [cancelStep, setCancelStep] = useState<CancelStep>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  const isPaidPlan = userPlan && !['free'].includes(userPlan);
  const lossItems = getLossItems(userPlan || 'free');

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

  if (!isPaidPlan) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>You're currently on the Free plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-5 rounded-xl border border-cyan-500/40 bg-cyan-500/5 space-y-3">
            <p className="font-semibold text-foreground">Unlock the full InsiderPulse experience</p>
            <p className="text-sm text-muted-foreground">
              Active signals, watchlist, AI assistant, price alerts, and more. Plans start at $9.99/mo.
            </p>
            <Button
              style={{ background: 'linear-gradient(to right, #06B6D4, #3B82F6)' }}
              onClick={() => navigate('/pricing')}
            >
              Upgrade to Pro
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
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
  );
}
