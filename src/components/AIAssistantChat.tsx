import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Sparkles, Volume2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getPlanLimits } from '@/lib/planLimits';
import { Link } from 'react-router-dom';

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
  const { user, userPlan } = useAuth();
  const planLimits = getPlanLimits(userPlan);
  const dailyLimit = planLimits.ai_messages_per_day;

  const getTodayKey = () => {
    const today = new Date().toISOString().split('T')[0];
    return `ip_ai_messages_${user?.id ?? 'anon'}_${today}`;
  };

  const getMessageCount = () => parseInt(localStorage.getItem(getTodayKey()) || '0', 10);

  const incrementMessageCount = () => {
    const key = getTodayKey();
    localStorage.setItem(key, String(getMessageCount() + 1));
    setTodayCount((c) => c + 1);
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [todayCount, setTodayCount] = useState(() => getMessageCount());
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const historyKey = user?.id ? `ai-chat-history-${user.id}` : null;

  // Load history when user becomes known. One-time migration of the legacy
  // global 'ai-chat-history' key into the user-scoped key so existing users
  // keep their history on first load post-rollout.
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

  // Auto-trigger chat for initial query from URL
  useEffect(() => {
    if (initialQuery && !hasProcessedInitialQuery.current && messages.length === 0) {
      hasProcessedInitialQuery.current = true;
      streamChat(initialQuery, false);
    }
  }, [initialQuery]);

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
      if (dailyLimit !== -1 && getMessageCount() >= dailyLimit) {
        toast({
          title: 'Daily message limit reached',
          description: 'Upgrade to send more messages.',
          variant: 'destructive',
        });
        return;
      }
      incrementMessageCount();
    }

    const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            context
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          let description = 'Upgrade your plan or wait until tomorrow.';
          try {
            const errorData = await response.json();
            if (errorData?.message) description = errorData.message;
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

      const contentType = response.headers.get('content-type');
      
      // Check if it's a JSON response (image generation)
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const images = data.choices?.[0]?.message?.images?.map((img: any) => img.image_url?.url) || [];
        
        setMessages([...newMessages, { 
          role: 'assistant', 
          content: content || 'Here\'s your generated image:', 
          images 
        }]);
      } else {
        // Streaming response
        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        let textBuffer = '';

        // Add empty assistant message
        setMessages([...newMessages, { role: 'assistant', content: '' }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex;
          while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                setMessages([...newMessages, { role: 'assistant', content: assistantMessage }]);
              }
            } catch {
              textBuffer = line + '\n' + textBuffer;
              break;
            }
          }
        }
      }
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
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) throw new Error('Speech generation failed');

      const { audioContent } = await response.json();
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

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            InsiderPulse AI Assistant
          </CardTitle>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              className="text-xs"
            >
              Clear History
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="mb-2">👋 Hi! I'm the InsiderPulse AI Assistant.</p>
              <p className="text-sm">Ask me about themes, signals, or market opportunities across all asset classes!</p>
              <p className="text-xs mt-4">✨ I can also generate charts and visualizations!</p>
              <p className="text-xs text-slate-500 mt-3">
                General market information only, not financial advice. See our{" "}
                <Link to="/terms" className="text-cyan-500 hover:underline">Terms of Service</Link>.
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
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                    {msg.images && msg.images.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {msg.images.map((imgUrl, imgIdx) => (
                          <img 
                            key={imgIdx}
                            src={imgUrl} 
                            alt="Generated visualization" 
                            className="rounded-lg max-w-full"
                          />
                        ))}
                      </div>
                    )}
                    {msg.role === 'assistant' && msg.content && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-6 px-2"
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
                  <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about themes, signals, or opportunities..."
              disabled={isLoading || (dailyLimit !== -1 && dailyLimit > 0 && todayCount >= dailyLimit) || dailyLimit === 0}
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {dailyLimit > 0 && dailyLimit !== -1 && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              {todayCount} of {dailyLimit} messages used today
              {todayCount >= dailyLimit && (
                <>. <Link to="/pricing" className="text-primary underline underline-offset-2">Upgrade</Link> for more</>
              )}
            </p>
          )}
          {dailyLimit === 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              <Link to="/pricing" className="text-primary underline underline-offset-2">Upgrade</Link> to use the AI Assistant
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
