import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

interface ThemeDiscoveryProps {
  unmappedSignals: any[];
  existingThemes: any[];
}

export const ThemeDiscovery = ({ unmappedSignals, existingThemes }: ThemeDiscoveryProps) => {
  const [suggestions, setSuggestions] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const discoverThemes = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discover-themes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ unmappedSignals, existingThemes }),
        }
      );

      if (!response.ok) throw new Error('Failed to discover themes');

      const data = await response.json();
      setSuggestions(data.suggestions);
      
      toast({
        title: 'Themes Discovered',
        description: 'AI has identified potential new opportunities',
      });
    } catch (error) {
      console.error('Theme discovery error:', error);
      toast({
        title: 'Error',
        description: 'Failed to discover new themes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Discover New Themes
          </CardTitle>
          <Button onClick={discoverThemes} disabled={loading || unmappedSignals.length === 0}>
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              'Analyze Signals'
            )}
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
        ) : suggestions ? (
          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap">{suggestions}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Click "Analyze Signals" to discover emerging themes from {unmappedSignals.length} unmapped signals
          </p>
        )}
      </CardContent>
    </Card>
  );
};
