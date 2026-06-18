CREATE TABLE public.chat_assistant_diagnostics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tavily_triggered BOOLEAN NOT NULL DEFAULT false,
  tavily_chars INTEGER NOT NULL DEFAULT 0,
  firecrawl_chars INTEGER NOT NULL DEFAULT 0,
  has_current_date BOOLEAN NOT NULL DEFAULT false,
  detected_contradiction BOOLEAN NOT NULL DEFAULT false,
  confidence_rating TEXT,
  model_input_total_chars INTEGER NOT NULL DEFAULT 0,
  user_query_preview TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT ALL ON public.chat_assistant_diagnostics TO service_role;
CREATE INDEX idx_chat_diag_user_created ON public.chat_assistant_diagnostics (user_id, created_at DESC);
ALTER TABLE public.chat_assistant_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.chat_assistant_diagnostics FOR ALL USING (false) WITH CHECK (false);