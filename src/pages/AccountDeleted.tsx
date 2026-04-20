import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AccountDeleted() {
  const { toast } = useToast();
  const [deletionId, setDeletionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('deletion_id');
    setDeletionId(id);
  }, []);

  const handleSubmitFeedback = async () => {
    if (!deletionId || !feedbackText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-exit-feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deletion_id: deletionId,
            feedback_text: feedbackText.slice(0, 2000),
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Submission failed');
      sessionStorage.removeItem('deletion_id');
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: 'Could not send feedback', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-[560px] border-border/50">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Top graphic */}
          <div className="flex justify-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
          </div>

          {/* Heading */}
          <div className="text-center space-y-3">
            <h1 className="text-2xl font-bold">Your account has been deleted</h1>
            <p className="text-sm text-muted-foreground">
              Your profile, watchlist, preferences, and personal data have been permanently removed.
              Your active subscription has been cancelled. Billing records are retained as required by
              Australian law.
            </p>
          </div>

          <div className="border-t border-border" />

          {/* Feedback form — only if we have a deletion_id and haven't submitted yet */}
          {deletionId && !submitted && (
            <div className="space-y-3">
              <div className="space-y-1 text-center">
                <h2 className="font-semibold">Thank you for trying InsiderPulse</h2>
                <p className="text-sm text-muted-foreground">
                  If there's something we could have done better, we'd like to know.
                  This is anonymous — we can't reply.
                </p>
              </div>
              <Textarea
                placeholder="What could we have done better?"
                maxLength={2000}
                rows={4}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value.slice(0, 2000))}
              />
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">{feedbackText.length} / 2000</p>
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={submitting || !feedbackText.trim()}
                >
                  {submitting
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending...</>
                    : 'Send feedback'}
                </Button>
              </div>
            </div>
          )}

          {submitted && (
            <div className="text-center p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <p className="text-sm text-cyan-600 dark:text-cyan-400 font-medium">
                Thank you — your feedback has been recorded.
              </p>
            </div>
          )}

          {(deletionId || submitted) && <div className="border-t border-border" />}

          {/* Footer links */}
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Changed your mind?{' '}
              <Link to="/auth" className="text-cyan-500 hover:text-cyan-400 font-medium">
                Create a new account
              </Link>
            </p>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link to="/">Return to homepage</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
