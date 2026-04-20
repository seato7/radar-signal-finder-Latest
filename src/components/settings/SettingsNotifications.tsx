import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

type PrefKey = 'email_daily_digest' | 'email_alerts' | 'email_weekly_summary' | 'email_marketing';

const TOGGLES: { key: PrefKey; title: string; description: string; defaultValue: boolean }[] = [
  { key: 'email_daily_digest',   title: 'Daily digest',          description: 'Top signals of the day',                      defaultValue: true },
  { key: 'email_alerts',         title: 'Real-time alerts',      description: 'Instant emails for your watchlist',           defaultValue: true },
  { key: 'email_weekly_summary', title: 'Weekly summary',        description: 'Weekly performance recap',                    defaultValue: true },
  { key: 'email_marketing',      title: 'Product updates',       description: 'New features and tips',                       defaultValue: false },
];

type Prefs = Record<PrefKey, boolean>;

export default function SettingsNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();

  const initial: Prefs = Object.fromEntries(TOGGLES.map((t) => [t.key, t.defaultValue])) as Prefs;
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const loaded: Prefs = { ...initial };
          for (const t of TOGGLES) {
            if (typeof (data as any)[t.key] === 'boolean') {
              loaded[t.key] = (data as any)[t.key];
            }
          }
          setPrefs(loaded);
        }
      } catch (err: any) {
        toast({ title: 'Could not load preferences', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const handleToggle = async (key: PrefKey, next: boolean) => {
    if (!user?.id) return;
    const previous = prefs[key];
    setPrefs({ ...prefs, [key]: next });
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: user.id, [key]: next }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch (err: any) {
      setPrefs({ ...prefs, [key]: previous });
      toast({ title: 'Could not save preference', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email notifications</CardTitle>
        <CardDescription>Choose which emails you want to receive</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <div className="space-y-5">
            {TOGGLES.map((t) => (
              <div key={t.key} className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor={t.key} className="text-sm font-medium">{t.title}</Label>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </div>
                <Switch
                  id={t.key}
                  checked={prefs[t.key]}
                  onCheckedChange={(v) => handleToggle(t.key, v)}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
