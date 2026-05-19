import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

const STEP_ORDER: DeleteStep[] = ['reason', 'loss', 'alternatives', 'export', 'confirm'];

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
  return [
    { icon: <BookMarked className="h-5 w-5 text-ds-brand-primary" />, label: 'Profile & preferences', detail: 'Your account settings and saved preferences' },
    { icon: <ShieldCheck className="h-5 w-5 text-ds-brand-primary" />, label: 'Access to InsiderPulse', detail: 'You will be signed out immediately' },
  ];
}

const ghostButtonClass =
  "border border-ds-border bg-transparent text-ds-text-primary hover:bg-ds-surface-elevated hover:border-ds-border-strong";
const primaryButtonClass =
  "bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90";
const destructiveButtonClass =
  "bg-ds-signal-negative text-white hover:bg-ds-signal-negative/90 rounded-md";
const inputClass =
  "bg-ds-surface-elevated border-ds-border text-ds-text-primary focus-visible:ring-ds-border-focus focus-visible:ring-offset-0";

function StepDots({ current }: { current: DeleteStep }) {
  const idx = STEP_ORDER.indexOf(current);
  if (idx < 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {STEP_ORDER.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 w-6 rounded-full transition-colors duration-fast ${
            i <= idx ? 'bg-ds-brand-primary' : 'bg-ds-border'
          }`}
        />
      ))}
    </div>
  );
}

function Shell({ children, current }: { children: React.ReactNode; current?: DeleteStep }) {
  return (
    <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6 space-y-6">
      {current && <StepDots current={current} />}
      {children}
    </div>
  );
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
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    setConfirmOpen(false);
    setStep('processing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Session expired. Please sign in again', variant: 'destructive' });
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
      <div className="rounded-ds-lg border border-ds-signal-negative/30 bg-ds-surface p-6 space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-ds-md bg-ds-signal-negative/10 border border-ds-signal-negative/30">
          <AlertTriangle className="h-5 w-5 text-ds-signal-negative mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <h2 className="text-h4 font-semibold text-ds-signal-negative">Delete Account</h2>
            <p className="text-body-sm text-ds-text-secondary">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </div>
        </div>
        <Button className={destructiveButtonClass} onClick={() => setStep('reason')}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete my account
        </Button>
      </div>
    );
  }

  // ── STEP: reason ──
  if (step === 'reason') {
    return (
      <Shell current="reason">
        <div>
          <h2 className="text-h4 font-semibold text-ds-text-primary">We're sorry to see you go. Can you tell us why?</h2>
          <p className="text-body-sm text-ds-text-secondary mt-1">Your feedback helps us improve.</p>
        </div>

        <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
          {[
            { v: 'too_expensive', l: 'Too expensive' },
            { v: 'not_useful', l: 'Not useful for me' },
            { v: 'switching', l: 'Switching to another tool' },
            { v: 'privacy', l: 'Privacy concerns' },
            { v: 'other', l: 'Other' },
          ].map((opt) => (
            <div key={opt.v} className="flex items-center space-x-3 p-3 rounded-ds-md border border-ds-border bg-ds-surface-elevated hover:border-ds-border-strong transition-colors duration-fast">
              <RadioGroupItem value={opt.v} id={`reason-${opt.v}`} />
              <Label htmlFor={`reason-${opt.v}`} className="flex-1 cursor-pointer text-body-sm text-ds-text-primary">{opt.l}</Label>
            </div>
          ))}
        </RadioGroup>

        <div className="space-y-2">
          <Label htmlFor="feedback" className="text-body-sm text-ds-text-secondary">Anything else you'd like us to know? (optional)</Label>
          <Textarea
            id="feedback"
            maxLength={2000}
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value.slice(0, 2000))}
            placeholder="What would have made InsiderPulse work better for you?"
            className={inputClass}
          />
          <p className="text-caption font-mono text-ds-text-muted">{feedback.length} / 2000</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button className={ghostButtonClass} onClick={resetAll}>Back</Button>
          <Button className={primaryButtonClass} disabled={!reason} onClick={() => setStep('loss')}>Continue</Button>
        </div>
      </Shell>
    );
  }

  // ── STEP: loss ──
  if (step === 'loss') {
    return (
      <Shell current="loss">
        <div className="flex items-start gap-3 p-4 rounded-ds-md bg-ds-signal-negative/10 border border-ds-signal-negative/30">
          <AlertTriangle className="h-5 w-5 text-ds-signal-negative mt-0.5 flex-shrink-0" />
          <p className="text-body font-semibold text-ds-text-primary">
            Deleting your account permanently removes all of the following.
          </p>
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

        <div className="flex flex-wrap gap-3">
          <Button className={ghostButtonClass} onClick={() => setStep('reason')}>Back</Button>
          <Button className={primaryButtonClass} onClick={() => setStep('alternatives')}>Continue</Button>
        </div>
      </Shell>
    );
  }

  // ── STEP: alternatives ──
  if (step === 'alternatives') {
    return (
      <Shell current="alternatives">
        <div>
          <h2 className="text-h4 font-semibold text-ds-text-primary">Before you delete, are you sure cancelling isn't enough?</h2>
          <p className="text-body-sm text-ds-text-secondary mt-1">
            Cancelling your subscription keeps your account and settings. You can resubscribe anytime. Deletion is forever.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {isPaid && (
            <button
              type="button"
              className="text-left h-auto p-4 rounded-ds-md border border-ds-brand-primary/40 bg-ds-brand-primary/5 hover:bg-ds-brand-primary/10 transition-colors duration-fast"
              onClick={() => navigate('/settings')}
            >
              <p className="text-body font-semibold text-ds-text-primary">Just cancel my subscription instead</p>
              <p className="text-caption text-ds-text-secondary mt-1">Keep your account. Downgrade to Free.</p>
            </button>
          )}
          <button
            type="button"
            className="text-left h-auto p-4 rounded-ds-md border border-ds-border bg-ds-surface-elevated hover:border-ds-border-strong transition-colors duration-fast"
            onClick={() => setStep('export')}
          >
            <p className="text-body font-semibold text-ds-text-primary">No, I want to delete</p>
            <p className="text-caption text-ds-text-secondary mt-1">Continue to data export and confirmation.</p>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setStep('loss')}
          className="text-body-sm text-ds-text-muted hover:text-ds-text-primary inline-flex items-center gap-1 transition-colors duration-fast"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
      </Shell>
    );
  }

  // ── STEP: export ──
  if (step === 'export') {
    return (
      <Shell current="export">
        <div>
          <h2 className="text-h4 font-semibold text-ds-text-primary">Download your data first?</h2>
          <p className="text-body-sm text-ds-text-secondary mt-1">
            We'll give you a JSON file containing your profile, watchlist, preferences, and account history.
            Once your account is deleted, this data is gone.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {!hasExported ? (
            <>
              <Button className={primaryButtonClass} onClick={handleExport} disabled={exporting}>
                {exporting
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Preparing export...</>
                  : <><Download className="h-4 w-4 mr-2" />Download my data</>}
              </Button>
              <Button className={ghostButtonClass} onClick={() => setStep('confirm')}>
                Skip, I don't need it
              </Button>
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-2 text-body-sm text-ds-signal-positive font-medium">
                <CheckCircle2 className="h-4 w-4" /> Data downloaded
              </div>
              <Button className={destructiveButtonClass} onClick={() => setStep('confirm')}>
                Continue to deletion
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setStep('alternatives')}
          className="text-body-sm text-ds-text-muted hover:text-ds-text-primary inline-flex items-center gap-1 transition-colors duration-fast"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
      </Shell>
    );
  }

  // ── STEP: confirm ──
  if (step === 'confirm') {
    const canDelete = confirmText.trim().toUpperCase() === 'DELETE' && password.length > 0;
    return (
      <Shell current="confirm">
        <h2 className="text-h4 font-semibold text-ds-signal-negative">Final confirmation</h2>

        <div className="p-4 rounded-ds-md border border-ds-signal-negative/40 bg-ds-signal-negative/10 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-ds-signal-negative mt-0.5 flex-shrink-0" />
          <p className="text-body-sm text-ds-text-primary">
            This action cannot be undone. Your account, profile, watchlist, preferences,
            and any active trading signals will be permanently deleted.
          </p>
        </div>

        <div className="space-y-2 max-w-sm">
          <Label htmlFor="delete-confirm" className="text-body-sm text-ds-text-secondary">Type DELETE to confirm</Label>
          <Input
            id="delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className={`${inputClass} font-mono`}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2 max-w-sm">
          <Label htmlFor="delete-password" className="text-body-sm text-ds-text-secondary">Enter your password</Label>
          <Input
            id="delete-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={inputClass}
          />
          <p className="text-caption text-ds-text-muted">Signed in as <span className="font-mono">{user?.email}</span></p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            onClick={() => setStep('export')}
            className="text-body-sm text-ds-text-muted hover:text-ds-text-primary inline-flex items-center gap-1 transition-colors duration-fast"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
          <div className="flex-1" />
          <Button className={destructiveButtonClass} disabled={!canDelete} onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete my account permanently
          </Button>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="bg-ds-surface-elevated border-ds-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-ds-text-primary">Delete your account permanently?</AlertDialogTitle>
              <AlertDialogDescription className="text-ds-text-secondary">
                This cannot be reversed. Your data will be erased and you'll be signed out immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={ghostButtonClass}>Keep my account</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className={destructiveButtonClass}>
                Yes, delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Shell>
    );
  }

  // ── STEP: processing ──
  return (
    <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
      <div className="py-16 flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-ds-signal-negative" />
        <p className="text-body-lg font-semibold text-ds-text-primary">Deleting your account...</p>
        <p className="text-body-sm text-ds-text-secondary">Please don't close this window.</p>
      </div>
    </div>
  );
}
