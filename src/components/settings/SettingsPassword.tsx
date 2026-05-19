import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const inputClass =
  "bg-ds-surface-elevated border-ds-border text-ds-text-primary focus-visible:ring-ds-border-focus focus-visible:ring-offset-0 pr-10";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  helper,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  helper?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-body-sm text-ds-text-secondary">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete={autoComplete}
          className={inputClass}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-ds-sm text-ds-text-muted hover:text-ds-text-primary transition-colors duration-fast"
              aria-label={visible ? 'Hide password' : 'Show password'}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-ds-surface-elevated border-ds-border text-ds-text-primary">
            {visible ? 'Hide password' : 'Show password'}
          </TooltipContent>
        </Tooltip>
      </div>
      {helper && <p className="text-caption text-ds-text-muted">{helper}</p>}
    </div>
  );
}

function strengthScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export default function SettingsPassword() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const score = strengthScore(newPassword);
  const strengthColor =
    score <= 1 ? 'bg-ds-signal-negative' : score <= 2 ? 'bg-ds-signal-warning' : 'bg-ds-signal-positive';
  const strengthLabel = score <= 1 ? 'Weak' : score <= 2 ? 'Fair' : score <= 3 ? 'Strong' : 'Very strong';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      toast({ title: 'No email on account', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) {
        toast({ title: 'Current password incorrect', variant: 'destructive' });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({ title: 'Password updated' });
    } catch (err: any) {
      toast({ title: 'Could not update password', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6 space-y-6">
      <div>
        <h2 className="text-h4 font-semibold text-ds-text-primary">Password</h2>
        <p className="text-body-sm text-ds-text-secondary mt-1">Change the password used to sign in</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
        <PasswordField
          id="current_password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />

        <div className="space-y-2">
          <PasswordField
            id="new_password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            helper="At least 8 characters."
          />
          {newPassword.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="h-1 w-full rounded-full bg-ds-surface-elevated overflow-hidden">
                <div
                  className={`h-full transition-all duration-fast ${strengthColor}`}
                  style={{ width: `${(score / 4) * 100}%` }}
                />
              </div>
              <p className="text-caption font-mono text-ds-text-muted">{strengthLabel}</p>
            </div>
          )}
        </div>

        <PasswordField
          id="confirm_password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          disabled={submitting}
          className="h-10 rounded-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90"
        >
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating...</> : 'Update password'}
        </Button>
      </form>
    </div>
  );
}
