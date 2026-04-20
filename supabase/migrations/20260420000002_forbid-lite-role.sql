-- Forbid the legacy 'lite' role without mutating the app_role enum.
-- Removing an enum value in Postgres requires rebuilding the type, which
-- would cascade-drop has_role() and every RLS policy that calls it — too
-- risky given policies may exist outside migration files (e.g. Studio-
-- created ones). Zero users currently have role = 'lite' (confirmed), so
-- a CHECK constraint is sufficient to prevent future assignment.
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_not_lite;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_not_lite CHECK (role <> 'lite');
