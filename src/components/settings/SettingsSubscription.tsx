import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const PLAN_PRICES: Record<string, string> = {
  starter: '$9.99 / mo',
  pro: '$29.99 / mo',
  premium: '$99 / mo',
  enterprise: 'Custom',
};

interface LossItem {
  icon: React.ReactNode;
  label: string;
  detail: string;
}

function getLossItems(plan: string): LossItem[] {
  const icon = 'text-ds-brand-primary';
  if (plan === 'starter') {
    return [
      { icon: <TrendingUp className={`h-5 w-5 ${icon}`} />, label: '1 Active Signal', detail: 'Your tracked trading signal will be removed' },
      { icon: <BookMarked className={`h-5 w-5 ${icon}`} />, label: '3 Watchlist Slots', detail: 'Your watchlist assets will no longer be tracked' },
      { icon: <Globe className={`h-5 w-5 ${icon}`} />, label: 'Investment Themes', detail: 'Access to 1 investment theme will be lost' },
      { icon: <Sparkles className={`h-5 w-5 ${icon}`} />, label: 'AI Assistant (5/day)', detail: 'AI-powered market insights will be disabled' },
      { icon: <Bell className={`h-5 w-5 ${icon}`} />, label: '1 Price Alert', detail: 'Your active price alert will stop firing' },
    ];
  }
  if (plan === 'pro') {
    return [
      { icon: <TrendingUp className={`h-5 w-5 ${icon}`} />, label: '3 Active Signals', detail: 'All 3 of your tracked signals will be removed' },
      { icon: <BookMarked className={`h-5 w-5 ${icon}`} />, label: '10 Watchlist Slots', detail: 'Your full watchlist will no longer be tracked' },
      { icon: <Globe className={`h-5 w-5 ${icon}`} />, label: '3 Investment Themes', detail: 'All 3 themes and their signals will be lost' },
      { icon: <Sparkles className={`h-5 w-5 ${icon}`} />, label: 'AI Assistant (20/day)', detail: '20 daily AI queries will be disabled' },
      { icon: <Bell className={`h-5 w-5 ${icon}`} />, label: '5 Price Alerts', detail: 'All your active alerts will stop firing' },
      { icon: <BarChart3 className={`h-5 w-5 ${icon}`} />, label: 'ETF & Forex Radar', detail: 'Access to ETF and forex asset classes will end' },
    ];
  }
  if (plan === 'premium' || plan === 'enterprise' || plan === 'admin') {
    return [
      { icon: <TrendingUp className={`h-5 w-5 ${icon}`} />, label: 'Unlimited Signals', detail: 'All your tracked signals will be removed' },
      { icon: <BookMarked className={`h-5 w-5 ${icon}`} />, label: 'Unlimited Watchlist', detail: 'Your entire watchlist will no longer be tracked' },
      { icon: <Globe className={`h-5 w-5 ${icon}`} />, label: 'All Investment Themes', detail: 'Access to every theme and score will be lost' },
      { icon: <Sparkles className={`h-5 w-5 ${icon}`} />, label: 'Unlimited AI Assistant', detail: 'All AI-powered market intelligence will be disabled' },
      { icon: <Bell className={`h-5 w-5 ${icon}`} />, label: 'Unlimited Alerts', detail: 'Every active alert will stop firing immediately' },
      { icon: <BarChart3 className={`h-5 w-5 ${icon}`} />, label: 'Full Asset Radar + Scores', detail: 'Scores, rankings and all asset classes will be hidden' },
      { icon: <Bot className={`h-5 w-5 ${icon}`} />, label: 'Trading Bots', detail: 'Your trading bots will be paused' },
      { icon: <ShieldCheck className={`h-5 w-5 ${icon}`} />, label: 'Analytics Dashboard', detail: 'All performance analytics will be removed' },
    ];
  }
  return [];
}

const ghostButtonClass =
  "border border-ds-border bg-transparent text-ds-text-primary hover:bg-ds-surface-elevated hover:border-ds-border-strong";
const primaryButtonClass =
  "bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90";

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
      if (!data?.success) throw new Error('Pause failed. Please try again');

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
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6 space-y-6">
        <div>
          <h2 className="text-h4 font-semibold text-ds-text-primary">Subscription</h2>
          <p className="text-body-sm text-ds-text-secondary mt-1">You're currently on the Free plan</p>
        </div>

        <div className="rounded-ds-lg border border-ds-brand-primary/40 bg-ds-brand-primary/5 p-5 space-y-3">
          <p className="text-body font-semibold text-ds-text-primary">Unlock the full InsiderPulse experience</p>
          <p className="text-body-sm text-ds-text-secondary">
            Active signals, watchlist, AI assistant, price alerts, and more. Plans start at <span className="font-mono">$9.99/mo</span>.
          </p>
          <Button className={primaryButtonClass} onClick={() => navigate('/pricing')}>
            Upgrade to Pro <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  const planKey = userPlan!;
  const planLabel = PLAN_LABELS[planKey] || planKey;
  const planPrice = PLAN_PRICES[planKey] || '';

  return (
    <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6 space-y-6">
      <div className="rounded-ds-lg border border-ds-border bg-ds-surface-elevated p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-overline text-ds-text-muted">Current Plan</p>
            <h3 className="text-h3 font-semibold text-ds-text-primary">{planLabel}</h3>
            {planPrice && <p className="text-h4 font-mono text-ds-text-primary">{planPrice}</p>}
          </div>
          <span className="inline-flex items-center rounded-ds-md border border-ds-signal-positive/40 px-2.5 py-1 text-caption font-medium text-ds-signal-positive">
            Active
          </span>
        </div>
      </div>

      {cancelStep === 'idle' && (
        <div className="flex flex-wrap gap-3">
          <Button className={ghostButtonClass} onClick={openStripePortal} disabled={portalLoading}>
            {portalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Manage Subscription
          </Button>
          <button
            type="button"
            className="text-body-sm text-ds-text-muted hover:text-ds-text-primary transition-colors duration-fast underline-offset-4 hover:underline"
            onClick={() => setCancelStep('loss')}
          >
            Cancel subscription
          </button>
        </div>
      )}

      {/* ── Step 1: Loss aversion ── */}
      {cancelStep === 'loss' && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-ds-md bg-ds-signal-negative/10 border border-ds-signal-negative/30">
            <AlertTriangle className="h-5 w-5 text-ds-signal-negative mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-body font-semibold text-ds-text-primary">Before you go, here's what you'll lose</p>
              <p className="text-body-sm text-ds-text-secondary mt-0.5">
                Cancelling removes access immediately at the end of your billing period.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {lossItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-ds-md border border-ds-border bg-ds-surface-elevated">
                <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                <div>
                  <p className="text-body-sm font-medium text-ds-text-primary">{item.label}</p>
                  <p className="text-caption text-ds-text-secondary">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button className={primaryButtonClass} onClick={() => setCancelStep('idle')}>
              Keep My Plan
            </Button>
            <Button className={ghostButtonClass} onClick={() => setCancelStep('pause')}>
              I still want to cancel <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Pause offer ── */}
      {cancelStep === 'pause' && (
        <div className="space-y-5">
          <div className="rounded-ds-lg border border-ds-brand-primary/40 bg-ds-brand-primary/5 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Pause className="h-5 w-5 text-ds-brand-primary" />
              <p className="text-body font-semibold text-ds-text-primary">Need a break? Pause for 30 days instead</p>
            </div>
            <p className="text-body-sm text-ds-text-secondary">
              We'll pause your billing for 30 days. Your signals, watchlist, themes and settings are all preserved exactly as they are. No charge. Resume anytime.
            </p>
            <Button
              className={`mt-2 w-full sm:w-auto ${primaryButtonClass}`}
              onClick={handlePauseRequest}
              disabled={pauseLoading}
            >
              {pauseLoading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Pausing account...</>
                : 'Pause My Account for 30 Days'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className={primaryButtonClass} onClick={() => setCancelStep('idle')}>
              Keep My Plan
            </Button>
            <Button className={ghostButtonClass} onClick={() => setCancelStep('downgrade')}>
              No thanks, keep going <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Downgrade offer ── */}
      {cancelStep === 'downgrade' && userPlan !== 'starter' && (
        <div className="space-y-5">
          <div className="rounded-ds-lg border border-ds-border bg-ds-surface-elevated p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-ds-brand-primary" />
              <p className="text-body font-semibold text-ds-text-primary">Switch to Starter for <span className="font-mono">$9.99/mo</span> instead</p>
            </div>
            <p className="text-body-sm text-ds-text-secondary">
              Keep access to InsiderPulse signals, your watchlist, and the AI assistant at a fraction of the cost. No data lost, just scaled back.
            </p>
            <ul className="text-body-sm text-ds-text-secondary space-y-1 ml-1">
              <li className="flex items-center gap-2"><span className="text-ds-signal-positive">✓</span> 1 active signal</li>
              <li className="flex items-center gap-2"><span className="text-ds-signal-positive">✓</span> Asset Radar (stocks)</li>
              <li className="flex items-center gap-2"><span className="text-ds-signal-positive">✓</span> AI Assistant (5 messages/day)</li>
              <li className="flex items-center gap-2"><span className="text-ds-signal-positive">✓</span> 1 investment theme</li>
            </ul>
            <Button className={`w-full sm:w-auto ${ghostButtonClass}`} onClick={handleDowngrade}>
              Switch to Starter for $9.99/mo
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className={primaryButtonClass} onClick={() => setCancelStep('idle')}>
              Keep My Plan
            </Button>
            <button
              type="button"
              className="text-body-sm text-ds-text-muted hover:text-ds-signal-negative transition-colors duration-fast inline-flex items-center gap-1"
              onClick={() => setCancelStep('confirm')}
            >
              No, I want to cancel completely <XCircle className="ml-1 h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Skip to confirm if already on Starter */}
      {cancelStep === 'downgrade' && userPlan === 'starter' && (
        <div className="space-y-3">
          <p className="text-body-sm text-ds-text-secondary">You're already on our lowest paid plan.</p>
          <div className="flex flex-wrap gap-3">
            <Button className={primaryButtonClass} onClick={() => setCancelStep('idle')}>Keep My Plan</Button>
            <button
              type="button"
              className="text-body-sm text-ds-text-muted hover:text-ds-signal-negative transition-colors duration-fast inline-flex items-center gap-1"
              onClick={() => setCancelStep('confirm')}
            >
              Cancel completely <XCircle className="ml-1 h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Final confirmation ── */}
      {(cancelStep === 'confirm' || cancelStep === 'processing') && (
        <div className="space-y-5">
          <div className="p-4 rounded-ds-md border border-ds-signal-negative/40 bg-ds-signal-negative/5 space-y-2">
            <p className="text-body font-semibold text-ds-signal-negative">This will cancel your subscription</p>
            <p className="text-body-sm text-ds-text-secondary">
              You'll keep access until the end of your current billing period. After that, all features above will be removed and your account will revert to Free.
            </p>
            <p className="text-body-sm text-ds-text-secondary font-medium">
              Type <span className="font-mono font-bold text-ds-signal-negative">CANCEL</span> below to confirm.
            </p>
          </div>

          <div className="space-y-2">
            <Input
              placeholder="Type CANCEL to confirm"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="max-w-xs font-mono bg-ds-surface-elevated border-ds-border text-ds-text-primary focus-visible:ring-ds-border-focus focus-visible:ring-offset-0"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button className={primaryButtonClass} onClick={() => { setCancelStep('idle'); setConfirmText(''); }}>
              Actually, keep my plan
            </Button>
            <Button
              className="bg-ds-signal-negative text-white hover:bg-ds-signal-negative/90 rounded-md"
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
    </div>
  );
}
