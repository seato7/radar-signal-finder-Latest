import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur shadow-data">
        <CardContent className="flex flex-col items-center text-center pt-10 pb-10 px-8 gap-6">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Plug className="h-10 w-10 text-primary" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Coming Soon</h2>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
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
                  className="flex-1"
                />
                <Button onClick={handleJoinWaitlist}>
                  Join Waitlist
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                Premium subscribers will get early access
              </p>
            </div>
          ) : (
            <div className="w-full rounded-lg bg-success/10 border border-success/30 p-4">
              <p className="text-sm text-success font-medium">
                You're on the waitlist!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                We'll email you as soon as broker connections are ready.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
