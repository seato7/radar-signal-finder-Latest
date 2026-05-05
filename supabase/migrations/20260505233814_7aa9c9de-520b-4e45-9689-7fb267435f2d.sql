-- Table to track daily AI message usage per user
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  user_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own AI usage" ON public.ai_usage_daily;
CREATE POLICY "Users can view their own AI usage"
  ON public.ai_usage_daily FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RPC: atomically check & increment a user's daily AI usage
CREATE OR REPLACE FUNCTION public.increment_ai_usage(_user_id uuid, _limit integer)
RETURNS TABLE(allowed boolean, current_count integer, daily_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_count integer;
BEGIN
  -- Unlimited plan
  IF _limit = -1 THEN
    INSERT INTO public.ai_usage_daily (user_id, usage_date, count)
    VALUES (_user_id, v_today, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET count = public.ai_usage_daily.count + 1, updated_at = now()
    RETURNING count INTO v_count;

    RETURN QUERY SELECT true, v_count, _limit;
    RETURN;
  END IF;

  -- Read current count
  SELECT count INTO v_count
    FROM public.ai_usage_daily
   WHERE user_id = _user_id AND usage_date = v_today;

  v_count := COALESCE(v_count, 0);

  IF v_count >= _limit THEN
    RETURN QUERY SELECT false, v_count, _limit;
    RETURN;
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, count)
  VALUES (_user_id, v_today, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET count = public.ai_usage_daily.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  RETURN QUERY SELECT true, v_count, _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, integer) TO authenticated, service_role;