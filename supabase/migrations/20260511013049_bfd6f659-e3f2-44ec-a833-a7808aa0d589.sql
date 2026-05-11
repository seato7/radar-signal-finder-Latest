-- Retrospective migration: user_policy_acceptances
-- This table was created manually in production. This migration captures the
-- existing definition idempotently so the audit log agrees with production
-- state and disaster-recovery rebuilds work correctly. It makes no functional
-- changes when applied to a database that already has the table.

CREATE TABLE IF NOT EXISTS public.user_policy_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tos_version text NOT NULL,
  privacy_version text NOT NULL,
  ip_address text,
  user_agent text,
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_policy_acceptances ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_policy_acceptances_user_id
  ON public.user_policy_acceptances (user_id);

CREATE INDEX IF NOT EXISTS idx_user_policy_acceptances_versions
  ON public.user_policy_acceptances (tos_version, privacy_version);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.user_policy_acceptances'::regclass
      AND polname = 'Users can view own acceptances'
  ) THEN
    CREATE POLICY "Users can view own acceptances"
      ON public.user_policy_acceptances
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.user_policy_acceptances'::regclass
      AND polname = 'Users can insert own acceptance'
  ) THEN
    CREATE POLICY "Users can insert own acceptance"
      ON public.user_policy_acceptances
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;
