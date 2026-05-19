import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, User as UserIcon } from 'lucide-react';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Asia/Tokyo',
  'Asia/Singapore',
];

const inputClass =
  "bg-ds-surface-elevated border-ds-border text-ds-text-primary focus-visible:ring-ds-border-focus focus-visible:ring-offset-0";

export default function SettingsProfile() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          setDisplayName((data as any).display_name ?? '');
          setAvatarUrl((data as any).avatar_url ?? null);
          setTimezone((data as any).timezone ?? 'UTC');
        }
      } catch (err: any) {
        toast({ title: 'Could not load profile', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName, timezone })
        .eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Profile saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '-';

  return (
    <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6 space-y-6">
      <div>
        <h2 className="text-h4 font-semibold text-ds-text-primary">Profile</h2>
        <p className="text-body-sm text-ds-text-secondary mt-1">Your personal details and display preferences</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-ds-text-secondary text-body-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-ds-surface-elevated border border-ds-border flex items-center justify-center overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-7 w-7 text-ds-text-muted" />
              )}
            </div>
            <div className="text-body-sm text-ds-text-secondary">
              <p>Avatar uploads coming soon.</p>
              <p>Member since <span className="font-mono">{memberSince}</span></p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-body-sm text-ds-text-secondary">Email</Label>
            <Input
              id="email"
              value={user?.email ?? ''}
              readOnly
              disabled
              className={`${inputClass} text-ds-text-muted`}
            />
            <p className="text-caption text-ds-text-muted">Contact support to change your email</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name" className="text-body-sm text-ds-text-secondary">Display name</Label>
            <Input
              id="display_name"
              placeholder="How you'll appear in the app"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-body-sm text-ds-text-secondary">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone" className={inputClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-10 rounded-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : 'Save changes'}
          </Button>
        </div>
      )}
    </div>
  );
}
