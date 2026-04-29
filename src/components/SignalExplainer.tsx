import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SignalExplainerProps {
  signal: {
    signal_type: string;
    value_text: string;
    observed_at: string;
  };
}

export const SignalExplainer = ({ signal }: SignalExplainerProps) => {
  const [explanation, setExplanation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const fetchExplanation = async () => {
    if (explanation) return; // Already loaded

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('explain-signal', {
        body: { signal },
      });
      if (error) throw error;
      setExplanation(data?.explanation ?? '');
    } catch (error) {
      console.error('Explanation error:', error);
      toast({
        title: 'Error',
        description: 'Failed to load explanation',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={fetchExplanation}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h4 className="font-medium">Signal Explanation</h4>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading explanation...</div>
          ) : explanation ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{explanation}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Click to load explanation</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
