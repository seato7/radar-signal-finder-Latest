import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle, Trash2, Loader2, CheckCircle2, Download, ArrowLeft,
  TrendingUp, Bell, BookMarked, Sparkles, BarChart3, Bot, Globe, ShieldCheck,
} from 'lucide-react';

type DeleteStep =
  | 'idle'
  | 'reason'
  | 'loss'
  | 'alternatives'
  | 'export'
  | 'confirm'
  | 'processing';

interface LossItem {
  icon: React.ReactNode;
  label: string;
  detail: string;
}

// Duplicated from SettingsSubscription — kept isolated to avoid cross-coupling.
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
  return [
    { icon: <BookMarked className="h-5 w-5 text-cyan-500" />, label: 'Profile & preferences', detail: 'Your account settings and saved preferences' },
    { icon: <ShieldCheck className="h-5 w-5 text-cyan-500" />, label: 'Access to InsiderPulse', detail: 'You will be signed out immediately' },
  ];
}

export default function SettingsDeleteAccount() {
  const navigate = useNavigate();
  const { user, userPlan } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<DeleteStep>('idle');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [hasExported, setHasExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');

  const lossItems = getLossItems(userPlan || 'free');
  const isPaid = userPlan && userPlan !== 'free';

  const resetAll = () => {
    setStep('idle');
    setReason('');
    setFeedback('');
    setHasExported(false);
    setConfirmText('');
    setPassword('');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not signed in');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-user-data`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `insiderpulse-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setHasExported(true);
      toast({ title: 'Export downloaded', description: 'Your data has been saved.' });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setStep('processing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Session expired — please sign in again', variant: 'destructive' });
        navigate('/auth');
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            password,
            reason,
            feedback: feedback || undefined,
            data_exported: hasExported,
          }),
        },
      );
      const body = await res.json();

      if (res.status === 401) {
        toast({ title: 'Incorrect password', variant: 'destructive' });
        setStep('confirm');
        return;
      }
      if (!res.ok) {
        toast({
          title: 'Deletion failed',
          description: body.error || 'Try again.',
          variant: 'destructive',
        });
        setStep('confirm');
        return;
      }

      if (body.deletion_id) {
        sessionStorage.setItem('deletion_id', body.deletion_id);
      }
      await supabase.auth.signOut();
      window.location.href = '/account-deleted';
    } catch (err: any) {
      toast({ title: 'Deletion failed', description: err.message, variant: 'destructive' });
      setStep('confirm');
    }
  };

  // ── STEP: idle ──
  if (step === 'idle') {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setStep('reason')}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete my account
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── STEP: reason ──
  if (step === 'reason') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>We're sorry to see you go. Can you tell us why?</CardTitle>
          <CardDescription>Your feedback helps us improve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
            {[
              { v: 'too_expensive', l: 'Too expensive' },
              { v: 'not_useful', l: 'Not useful for me' },
              { v: 'switching', l: 'Switching to another tool' },
              { v: 'privacy', l: 'Privacy concerns' },
              { v: 'other', l: 'Other' },
            ].map((opt) => (
              <div key={opt.v} className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50">
                <RadioGroupItem value={opt.v} id={`reason-${opt.v}`} />
                <Label htmlFor={`reason-${opt.v}`} className="flex-1 cursor-pointer">{opt.l}</Label>
              </div>
            ))}
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="feedback">Anything else you'd like us to know? (optional)</Label>
            <Textarea
              id="feedback"
              maxLength={2000}
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value.slice(0, 2000))}
              placeholder="What would have made InsiderPulse work better for you?"
            />
            <p className="text-xs text-muted-foreground">{feedback.length} / 2000</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="default" onClick={resetAll}>Back</Button>
            <Button variant="outline" disabled={!reason} onClick={() => setStep('loss')}>Continue</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── STEP: loss ──
  if (step === 'loss') {
    return (
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-foreground">Deleting your account permanently removes all of the following.</p>
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

          <div className="flex flex-wrap gap-3">
            <Button variant="default" onClick={() => setStep('reason')}>Back</Button>
            <Button variant="outline" onClick={() => setStep('alternatives')}>Continue</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── STEP: alternatives ──
  if (step === 'alternatives') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Before you delete — are you sure cancelling isn't enough?</CardTitle>
          <CardDescription>
            Cancelling your subscription keeps your account and settings. You can resubscribe anytime. Deletion is forever.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {isPaid && (
              <Button
                variant="default"
                className="h-auto py-4 text-left"
                style={{ background: 'linear-gradient(to right, #06B6D4, #3B82F6)' }}
                onClick={() => navigate('/settings')}
              >
                <div className="w-full">
                  <p className="font-semibold">Just cancel my subscription instead</p>
                  <p className="text-xs opacity-90 mt-1">Keep your account. Downgrade to Free.</p>
                </div>
              </Button>
            )}
            <Button
              variant="outline"
              className="h-auto py-4 text-left text-muted-foreground"
              onClick={() => setStep('export')}
            >
              <div className="w-full">
                <p className="font-semibold">No, I want to delete</p>
                <p className="text-xs mt-1">Continue to data export and confirmation.</p>
              </div>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setStep('loss')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
        </CardContent>
      </Card>
    );
  }

  // ── STEP: export ──
  if (step === 'export') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Download your data first?</CardTitle>
          <CardDescription>
            We'll give you a JSON file containing your profile, watchlist, preferences, and account history.
            Once your account is deleted, this data is gone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-3">
            {!hasExported ? (
              <>
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Preparing export...</>
                    : <><Download className="h-4 w-4 mr-2" />Download my data</>}
                </Button>
                <Button variant="outline" onClick={() => setStep('confirm')}>
                  Skip — I don't need it
                </Button>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 text-sm text-cyan-500 font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Data downloaded
                </div>
                <Button variant="destructive" onClick={() => setStep('confirm')}>
                  Continue to deletion
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setStep('alternatives')}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
        </CardContent>
      </Card>
    );
  }

  // ── STEP: confirm ──
  if (step === 'confirm') {
    const canDelete = confirmText.trim().toUpperCase() === 'DELETE' && password.length > 0;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Final confirmation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/5 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">
                This action cannot be undone. Your account, profile, watchlist, preferences,
                and any active trading signals will be permanently deleted.
              </p>
            </div>
          </div>

          <div className="space-y-2 max-w-sm">
            <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2 max-w-sm">
            <Label htmlFor="delete-password">Enter your password</Label>
            <Input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <p className="text-xs text-muted-foreground">Signed in as {user?.email}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep('export')}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <div className="flex-1" />
            <Button variant="destructive" disabled={!canDelete} onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete my account permanently
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── STEP: processing ──
  return (
    <Card>
      <CardContent className="py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-destructive" />
          <p className="text-lg font-semibold">Deleting your account...</p>
          <p className="text-sm text-muted-foreground">Please don't close this window.</p>
        </div>
      </CardContent>
    </Card>
  );
}
