import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plug, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SettingsBrokers() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleJoinWaitlist = () => {
    if (!email.trim() || !email.includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitted(true);
    toast({
      title: "You're on the list!",
      description: "We'll notify you when broker connections launch.",
    });
  };

  return (
    <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-6">
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-full max-w-md rounded-ds-lg border border-ds-border bg-ds-surface-elevated p-8 flex flex-col items-center text-center gap-6">
          <div className="h-20 w-20 rounded-ds-lg bg-ds-brand-primary/10 border border-ds-brand-primary/20 flex items-center justify-center">
            <Plug className="h-10 w-10 text-ds-brand-primary" />
          </div>

          <div className="space-y-2">
            <h3 className="text-h3 font-semibold text-ds-text-primary">Coming Soon</h3>
            <p className="text-body-sm text-ds-text-secondary leading-relaxed max-w-sm">
              Connect Alpaca, Interactive Brokers, and other supported brokers to execute
              InsiderPulse signals from one place. Premium users will get first access when we launch.
            </p>
          </div>

          {!submitted ? (
            <div className="w-full space-y-3">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinWaitlist()}
                  className="flex-1 bg-ds-surface border-ds-border text-ds-text-primary focus-visible:ring-ds-border-focus focus-visible:ring-offset-0"
                />
                <Button
                  onClick={handleJoinWaitlist}
                  className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90"
                >
                  Join Waitlist
                </Button>
              </div>
              <p className="text-caption text-ds-text-muted flex items-center justify-center gap-1.5">
                <Sparkles className="h-3 w-3 text-ds-brand-primary" />
                Premium subscribers will get early access
              </p>
            </div>
          ) : (
            <div className="w-full rounded-ds-md bg-ds-signal-positive/10 border border-ds-signal-positive/30 p-4">
              <p className="text-body-sm text-ds-signal-positive font-medium">
                You're on the waitlist!
              </p>
              <p className="text-caption text-ds-text-muted mt-1">
                We'll email you as soon as broker connections are ready.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
