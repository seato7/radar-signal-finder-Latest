import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

interface DailyDigestProps {
  userWatchlist: any[];
  recentSignals: any[];
  userActivity?: string;
}

export const DailyDigest = ({ userWatchlist, recentSignals, userActivity }: DailyDigestProps) => {
  const [digest, setDigest] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDigest = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-digest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ userWatchlist, recentSignals, userActivity }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate digest');

      const data = await response.json();
      setDigest(data.digest);
    } catch (error) {
      console.error('Digest error:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate daily digest',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigest();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Your Daily Digest
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchDigest} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap">{digest}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
