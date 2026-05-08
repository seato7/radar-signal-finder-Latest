-- Retrospective migration: ai_usage_daily table + increment_ai_usage RPC
-- These objects were created via manual SQL Editor during chat-assistant
-- debugging (Sessions 27-28) and never recorded as migrations. This file
-- captures their current production definitions. Idempotent so it is
-- safe to apply against the live database.

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  user_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC'::text))::date,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.ai_usage_daily'::regclass
      AND polname = 'Users can view their own AI usage'
  ) THEN
    CREATE POLICY "Users can view their own AI usage"
      ON public.ai_usage_daily
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.increment_ai_usage(_user_id uuid, _limit integer)
RETURNS TABLE(allowed boolean, current_count integer, daily_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_count integer;
BEGIN
  IF _limit = -1 THEN
    INSERT INTO public.ai_usage_daily (user_id, usage_date, count)
    VALUES (_user_id, v_today, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET count = public.ai_usage_daily.count + 1, updated_at = now()
    RETURNING count INTO v_count;

    RETURN QUERY SELECT true, v_count, _limit;
    RETURN;
  END IF;

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
$function$;