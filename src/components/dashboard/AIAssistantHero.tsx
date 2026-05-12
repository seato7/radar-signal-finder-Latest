import { useState } from "react";
import { Bot, Send } from "lucide-react";
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
    <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-ds-md bg-ds-surface-elevated border border-ds-border flex items-center justify-center">
            <Bot className="h-4 w-4 text-ds-text-secondary" />
          </div>
          <div>
            <h3 className="text-h3 font-semibold text-ds-text-primary">
              InsiderPulse AI Assistant
            </h3>
            <p className="text-body-sm text-ds-text-secondary mt-0.5">
              Analyze signals across 30+ data sources with real-time validation
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about any asset, theme, or market signal..."
            className="flex-1 h-10 bg-ds-surface-elevated border-ds-border text-ds-text-primary placeholder:text-ds-text-muted rounded-ds-md focus-visible:ring-1 focus-visible:ring-ds-border-focus focus-visible:ring-offset-0 focus-visible:border-ds-border-focus"
          />
          <Button
            type="submit"
            className="h-10 px-4 bg-ds-brand-primary hover:bg-ds-brand-primary/90 text-ds-brand-primary-foreground rounded-ds-md"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-ds-text-muted">Try:</span>
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleExampleClick(prompt)}
              className="text-body-sm px-2.5 py-1 rounded-ds-sm bg-ds-surface-elevated border border-ds-border text-ds-text-secondary hover:text-ds-text-primary hover:border-ds-border-strong transition-colors duration-fast ease-ds-out"
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
