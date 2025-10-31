import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DiscoveredTheme {
  id: string;
  name: string;
  description?: string;
  why_now?: string;
  keywords: string[];
  tickers?: string[];
  confidence?: string;
}

export default function ThemeDiscovery() {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredThemes, setDiscoveredThemes] = useState<DiscoveredTheme[]>([]);
  const [stats, setStats] = useState<{ patterns_analyzed: number; themes_created: number } | null>(null);
  const { toast } = useToast();

  const runDiscovery = async () => {
    setIsDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke('mine-and-discover-themes');
      
      if (error) throw error;
      
      if (data.error) {
        if (data.error.includes('Rate limit')) {
          toast({
            title: 'Rate Limit Reached',
            description: 'AI usage limit exceeded. Please try again later.',
            variant: 'destructive',
          });
        } else {
          throw new Error(data.error);
        }
        return;
      }

      setDiscoveredThemes(data.discovered || []);
      setStats({
        patterns_analyzed: data.patterns_analyzed || 0,
        themes_created: data.themes_created || 0,
      });

      toast({
        title: 'Discovery Complete',
        description: `Found ${data.themes_created} new themes from ${data.patterns_analyzed} data patterns`,
      });
    } catch (error) {
      console.error('Theme discovery error:', error);
      toast({
        title: 'Discovery Failed',
        description: error instanceof Error ? error.message : 'Failed to discover themes',
        variant: 'destructive',
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Theme Discovery</h1>
          <p className="text-muted-foreground mt-2">
            Mine data patterns and discover emerging investment themes
          </p>
        </div>
        <Button
          onClick={runDiscovery}
          disabled={isDiscovering}
          size="lg"
          className="gap-2"
        >
          {isDiscovering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Discovering...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Discover Themes
            </>
          )}
        </Button>
      </div>

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Discovery Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold">{stats.patterns_analyzed}</div>
                <div className="text-sm text-muted-foreground">Data Patterns Analyzed</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.themes_created}</div>
                <div className="text-sm text-muted-foreground">New Themes Created</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {discoveredThemes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Discovered Themes</h2>
          {discoveredThemes.map((theme) => (
            <Card key={theme.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{theme.name}</CardTitle>
                    <CardDescription className="mt-2">{theme.description}</CardDescription>
                  </div>
                  {theme.confidence && (
                    <Badge variant={
                      theme.confidence === 'High' ? 'default' :
                      theme.confidence === 'Medium' ? 'secondary' : 'outline'
                    }>
                      {theme.confidence} Confidence
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {theme.why_now && (
                  <div>
                    <div className="text-sm font-medium mb-1">Why Now?</div>
                    <div className="text-sm text-muted-foreground">{theme.why_now}</div>
                  </div>
                )}
                
                {theme.tickers && theme.tickers.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Related Tickers</div>
                    <div className="flex flex-wrap gap-2">
                      {theme.tickers.map((ticker) => (
                        <Badge key={ticker} variant="outline">{ticker}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                <div>
                  <div className="text-sm font-medium mb-2">Tracking Keywords</div>
                  <div className="flex flex-wrap gap-2">
                    {theme.keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary">{keyword}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isDiscovering && discoveredThemes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Click "Discover Themes" to mine your data and find emerging opportunities
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
