import { useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

const EXAMPLE_PROMPTS = [
  "What's moving in semiconductors today?",
  "Show me dark pool activity in AAPL",
  "Which sectors have bullish insider trades?",
  "Top momentum plays right now",
];

const AIAssistantHero = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/assistant?q=${encodeURIComponent(query)}`);
    }
  };

  const handleExampleClick = (prompt: string) => {
    navigate(`/assistant?q=${encodeURIComponent(prompt)}`);
  };

  return (
    <Card className="bg-gradient-hero border-primary/30 overflow-hidden relative">
      {/* Animated glow background */}
      <div className="absolute inset-0 bg-gradient-glow" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      
      <CardContent className="p-6 relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-gradient-chrome flex items-center justify-center shadow-chrome">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              Ask the AI Assistant
              <Sparkles className="h-4 w-4 text-warning" />
            </h3>
            <p className="text-sm text-muted-foreground">
              Analyze signals across 30+ data sources instantly
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about any asset, theme, or market signal..."
            className="flex-1 bg-background/50 border-border/50 focus:border-primary"
          />
          <Button type="submit" className="bg-gradient-chrome hover:opacity-90">
            <Send className="h-4 w-4" />
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleExampleClick(prompt)}
              className="text-xs px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border"
            >
              {prompt}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AIAssistantHero;