import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles, Volume2, Hand } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { useAnonSignupCTA } from '@/hooks/useAnonSignupCTA';
import { getPlanLimits } from '@/lib/planLimits';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { TierCeiling } from '@/components/conversion/TierCeiling';
import { getUpgradeTarget } from '@/lib/upgradeTarget';
import { cn } from '@/lib/utils';


interface Message {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

interface AIAssistantChatProps {
  context?: any;
  onClose?: () => void;
  initialQuery?: string;
}

export const AIAssistantChat = ({ context, onClose, initialQuery }: AIAssistantChatProps) => {
  const hasProcessedInitialQuery = useRef(false);
  const { user, userPlan, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const anonSignup = useAnonSignupCTA();
  const planLimits = getPlanLimits(userPlan);
  const dailyLimit = planLimits.ai_messages_per_day;


  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [todayCount, setTodayCount] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const historyKey = user?.id ? `ai-chat-history-${user.id}` : null;

  useEffect(() => {
    if (!user?.id) {
      setTodayCount(0);
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('ai_usage_daily')
      .select('count')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .maybeSingle()
      .then(({ data }) => {
        setTodayCount(data?.count ?? 0);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!historyKey) {
      setMessages([]);
      return;
    }
    const legacy = localStorage.getItem('ai-chat-history');
    if (legacy && !localStorage.getItem(historyKey)) {
      localStorage.setItem(historyKey, legacy);
    }
    if (legacy) {
      localStorage.removeItem('ai-chat-history');
    }
    const saved = localStorage.getItem(historyKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        setMessages([]);
      }
    }
  }, [historyKey]);

  useEffect(() => {
    if (!historyKey) return;
    localStorage.setItem(historyKey, JSON.stringify(messages));
  }, [messages, historyKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (initialQuery && !hasProcessedInitialQuery.current && messages.length === 0) {
      hasProcessedInitialQuery.current = true;
      if (!isAuthenticated) {
        anonSignup('assistant_initial_query');
        return;
      }
      streamChat(initialQuery, false);
    }
  }, [initialQuery, isAuthenticated]);


  const streamChat = async (userMessage: string, countAgainstLimit = true) => {
    if (countAgainstLimit) {
      if (dailyLimit === 0) {
        toast({
          title: 'Upgrade required',
          description: 'AI Assistant requires a paid plan.',
          variant: 'destructive',
        });
        return;
      }
      if (dailyLimit !== -1 && todayCount >= dailyLimit) {
        toast({
          title: 'Daily message limit reached',
          description: 'Upgrade to send more messages.',
          variant: 'destructive',
        });
        return;
      }
    }

    const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: { messages: newMessages, context },
      });

      if (error) {
        if ((error as any).context?.status === 429) {
          let description = 'Upgrade your plan or wait until tomorrow.';
          try {
            const errorData = await (error as any).context.json();
            if (errorData?.message) description = errorData.message;
            if (typeof errorData?.current_count === 'number') {
              setTodayCount(errorData.current_count);
            }
          } catch {
            // fall through to default description
          }
          toast({
            title: 'Daily message limit reached',
            description,
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
        throw new Error('Failed to start chat');
      }

      if (typeof data?.current_count === 'number') {
        setTodayCount(data.current_count);
      }

      const content = data?.choices?.[0]?.message?.content || '';
      const images = data?.choices?.[0]?.message?.images?.map((img: any) => img.image_url?.url) || [];

      setMessages([...newMessages, {
        role: 'assistant',
        content: content || "Here's your generated image:",
        images,
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!isAuthenticated) {
      anonSignup('assistant_send');
      return;
    }
    if (!input.trim() || isLoading) return;
    streamChat(input);
  };


  const clearHistory = () => {
    setMessages([]);
    if (historyKey) localStorage.removeItem(historyKey);
    toast({
      title: 'History cleared',
      description: 'Conversation history has been cleared.',
    });
  };

  const speakMessage = async (text: string) => {
    if (isSpeaking) return;

    setIsSpeaking(true);
    try {
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { text },
      });
      if (error) throw error;
      const audioContent = data?.audioContent;
      if (!audioContent) throw new Error('Speech generation failed');
      const audio = new Audio(`data:audio/mpeg;base64,${audioContent}`);
      audio.onended = () => setIsSpeaking(false);
      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
      toast({
        title: 'Voice unavailable',
        description: 'Text-to-speech requires ElevenLabs API key',
        variant: 'destructive',
      });
    }
  };

  const inputDisabled =
    isLoading ||
    (dailyLimit !== -1 && dailyLimit > 0 && todayCount >= dailyLimit) ||
    dailyLimit === 0;
  const isAtDailyLimit = dailyLimit !== -1 && dailyLimit > 0 && todayCount >= dailyLimit;
  const isNearDailyLimit =
    dailyLimit !== -1 &&
    dailyLimit > 0 &&
    !isAtDailyLimit &&
    (dailyLimit <= 5 ? todayCount === dailyLimit - 1 : (todayCount / dailyLimit) * 100 >= 80);

  return (
    <Card className="h-[calc(100vh-14rem)] max-h-[700px] min-h-[400px] flex flex-col bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
      <CardHeader className="border-b border-ds-border px-5 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-h4 font-semibold text-ds-text-primary">
            <Sparkles className="h-4 w-4 text-ds-brand-primary" />
            InsiderPulse AI Assistant
          </CardTitle>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              className="text-caption text-ds-text-muted hover:text-ds-text-primary"
            >
              Clear History
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        <ScrollArea ref={scrollRef} className="flex-1 p-5">
          {messages.length === 0 ? (
            <div className="text-center text-ds-text-secondary py-10 max-w-md mx-auto">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-ds-md border border-ds-border bg-ds-surface-elevated mb-4">
                <Hand className="h-4 w-4 text-ds-brand-primary" />
              </div>
              <p className="text-body text-ds-text-primary mb-2">
                Hi, I'm the InsiderPulse AI Assistant.
              </p>
              <p className="text-body-sm text-ds-text-secondary">
                Ask me about themes, signals, or market opportunities across all asset classes.
              </p>
              <p className="text-caption text-ds-text-muted mt-4">
                I can also generate charts and visualizations.
              </p>
              <p className="text-caption text-ds-text-muted mt-6">
                General market information only, not financial advice. See our{' '}
                <Link to="/terms" className="text-ds-brand-primary hover:underline">
                  Terms of Service
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-[70%] rounded-ds-md px-4 py-2.5 bg-ds-brand-primary text-white'
                        : 'max-w-[80%] rounded-ds-md px-4 py-2.5 bg-ds-surface-elevated border border-ds-border text-ds-text-primary'
                    }
                  >
                    {msg.content && (
                      <p className="text-body-sm whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>
                    )}
                    {msg.images && msg.images.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {msg.images.map((imgUrl, imgIdx) => (
                          <img
                            key={imgIdx}
                            src={imgUrl}
                            alt="Generated visualization"
                            className="rounded-ds-sm max-w-full border border-ds-border"
                          />
                        ))}
                      </div>
                    )}
                    {msg.role === 'assistant' && msg.content && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-6 px-2 text-ds-text-muted hover:text-ds-text-primary"
                        onClick={() => speakMessage(msg.content)}
                        disabled={isSpeaking}
                      >
                        <Volume2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-ds-surface-elevated border border-ds-border rounded-ds-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-1.5 h-1.5 bg-ds-brand-primary rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-ds-brand-primary rounded-full animate-bounce delay-100" />
                      <div className="w-1.5 h-1.5 bg-ds-brand-primary rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-ds-border-strong bg-ds-surface-elevated p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about themes, signals, or opportunities..."
              disabled={inputDisabled}
              className="bg-ds-surface border-ds-border text-ds-text-primary placeholder:text-ds-text-muted h-11 md:h-10"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-ds-brand-primary hover:bg-ds-brand-primary/90 text-white h-11 w-11 md:h-10 md:w-10 p-0 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {dailyLimit > 0 && dailyLimit !== -1 && (
            <p
              className={cn(
                "text-caption font-mono mt-2 text-right",
                isAtDailyLimit
                  ? "text-ds-signal-negative"
                  : isNearDailyLimit
                  ? "text-ds-signal-warning"
                  : "text-ds-text-muted"
              )}
            >
              {todayCount} of {dailyLimit} messages used today
              {todayCount >= dailyLimit && (
                <>
                  .{' '}
                  <Link to="/pricing" className="text-ds-brand-primary hover:underline">
                    Upgrade
                  </Link>{' '}
                  for more
                </>
              )}
            </p>
          )}
          {dailyLimit === 0 && (
            <p className="text-caption font-mono text-ds-text-muted mt-2 text-right">
              <Link to="/pricing" className="text-ds-brand-primary hover:underline">
                Upgrade
              </Link>{' '}
              to use the AI Assistant
            </p>
          )}
          {dailyLimit > 0 && dailyLimit !== -1 && todayCount >= dailyLimit && (() => {
            const t = getUpgradeTarget(userPlan || 'free', 'ai');
            return (
              <div className="mt-3">
                <TierCeiling
                  currentUsage={todayCount}
                  limit={dailyLimit}
                  limitUnit="messages"
                  currentTier={(userPlan as any) || 'free'}
                  nextTier={t.nextTier}
                  nextTierBenefit={t.benefit}
                  timeScope="daily"
                  trackingLabel="ai_chat_daily_limit"
                />
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
};
