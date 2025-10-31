-- Create bots table for trading bot configurations
CREATE TABLE IF NOT EXISTS public.bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL,
  tickers TEXT[] NOT NULL DEFAULT '{}',
  params JSONB NOT NULL DEFAULT '{}',
  risk_policy JSONB NOT NULL DEFAULT '{"max_drawdown_pct": 10, "max_position_value_usd": 10000, "slippage_bps": 10}',
  mode TEXT NOT NULL DEFAULT 'paper',
  status TEXT NOT NULL DEFAULT 'stopped',
  theme_subscriptions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create broker_keys table for storing encrypted broker credentials
CREATE TABLE IF NOT EXISTS public.broker_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  exchange TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  secret_key_encrypted TEXT NOT NULL,
  paper_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create bot_logs table for bot execution logs
CREATE TABLE IF NOT EXISTS public.bot_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create positions table for bot positions
CREATE TABLE IF NOT EXISTS public.bot_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  unrealized_pnl DOUBLE PRECISION DEFAULT 0,
  realized_pnl DOUBLE PRECISION DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'paper',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create orders table for bot orders
CREATE TABLE IF NOT EXISTS public.bot_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  slippage_applied DOUBLE PRECISION DEFAULT 0,
  reason TEXT,
  mode TEXT NOT NULL DEFAULT 'paper',
  broker_order_id TEXT,
  status TEXT DEFAULT 'filled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bots
CREATE POLICY "Users can view their own bots" 
ON public.bots FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bots" 
ON public.bots FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bots" 
ON public.bots FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bots" 
ON public.bots FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all bots" 
ON public.bots FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for broker_keys
CREATE POLICY "Users can view their own broker keys" 
ON public.broker_keys FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own broker keys" 
ON public.broker_keys FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own broker keys" 
ON public.broker_keys FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own broker keys" 
ON public.broker_keys FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for bot_logs
CREATE POLICY "Users can view logs for their bots" 
ON public.bot_logs FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.bots WHERE bots.id = bot_logs.bot_id AND bots.user_id = auth.uid()
));

CREATE POLICY "Service role can insert logs" 
ON public.bot_logs FOR INSERT 
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for bot_positions
CREATE POLICY "Users can view positions for their bots" 
ON public.bot_positions FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.bots WHERE bots.id = bot_positions.bot_id AND bots.user_id = auth.uid()
));

CREATE POLICY "Service role can manage positions" 
ON public.bot_positions FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for bot_orders
CREATE POLICY "Users can view orders for their bots" 
ON public.bot_orders FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.bots WHERE bots.id = bot_orders.bot_id AND bots.user_id = auth.uid()
));

CREATE POLICY "Service role can manage orders" 
ON public.bot_orders FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create indexes for performance
CREATE INDEX idx_bots_user_id ON public.bots(user_id);
CREATE INDEX idx_bots_status ON public.bots(status);
CREATE INDEX idx_broker_keys_user_id ON public.broker_keys(user_id);
CREATE INDEX idx_bot_logs_bot_id ON public.bot_logs(bot_id);
CREATE INDEX idx_bot_positions_bot_id ON public.bot_positions(bot_id);
CREATE INDEX idx_bot_orders_bot_id ON public.bot_orders(bot_id);