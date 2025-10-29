-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('free', 'lite', 'pro', 'admin');

-- Create user_roles table with proper security
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'free',
    granted_at TIMESTAMPTZ DEFAULT now(),
    granted_by UUID REFERENCES auth.users(id),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to get user's highest role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'admin' THEN 4
    WHEN 'pro' THEN 3
    WHEN 'lite' THEN 2
    WHEN 'free' THEN 1
  END DESC
  LIMIT 1
$$;

-- RLS Policies for user_roles table
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger function to assign default 'free' role to new users
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'free');
  RETURN NEW;
END;
$$;

-- Trigger to automatically assign role on signup
CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();

-- Add comments documenting intentional public data access
COMMENT ON POLICY "Allow public read access to social signals" ON public.social_signals IS 
  'INTENTIONAL: Market data is public for free tier. This enables broader access while we build user base.';

COMMENT ON POLICY "Allow public read access to congressional trades" ON public.congressional_trades IS 
  'INTENTIONAL: Congressional trade data is public information. Free tier access by design.';

COMMENT ON POLICY "Allow public read access to breaking news" ON public.breaking_news IS 
  'INTENTIONAL: Breaking news is publicly accessible. Premium features will be rate-limiting and advanced analytics.';

COMMENT ON POLICY "Allow public read access to earnings sentiment" ON public.earnings_sentiment IS 
  'INTENTIONAL: Basic earnings data is public. Premium tiers get real-time updates and AI analysis.';

COMMENT ON POLICY "Allow public read access to job postings" ON public.job_postings IS 
  'INTENTIONAL: Job posting signals are public data for all users.';

COMMENT ON POLICY "Allow public read access to options flow" ON public.options_flow IS 
  'INTENTIONAL: Options flow data is public. Premium users get alerts and deeper analytics.';

COMMENT ON POLICY "Allow public read access to patent filings" ON public.patent_filings IS 
  'INTENTIONAL: Patent filing information is public data accessible to all tiers.';

COMMENT ON POLICY "Allow public read access to search trends" ON public.search_trends IS 
  'INTENTIONAL: Search trend data is publicly available for free tier users.';

COMMENT ON POLICY "Allow public read access to short interest" ON public.short_interest IS 
  'INTENTIONAL: Short interest data is public. Premium features include alerts and trend analysis.';

COMMENT ON POLICY "Allow public read access to supply chain signals" ON public.supply_chain_signals IS 
  'INTENTIONAL: Supply chain signals are public data. Premium users get AI-powered insights.';