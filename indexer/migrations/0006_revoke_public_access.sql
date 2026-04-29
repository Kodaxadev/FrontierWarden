-- =============================================================================
-- 0006_revoke_public_access.sql
-- Clears two WARN-level Supabase linter findings.
--
-- Context: the frontend has no VITE_SUPABASE_* env vars and never hits Supabase
-- directly. All reads go through the Rust API server (service_role, which
-- bypasses RLS). Anon / authenticated access to these objects is unnecessary
-- and represents unintended attack surface.
--
-- What is NOT changed: the 16 "RLS enabled, no policies" INFO findings.
-- Those tables ARE correctly locked down — RLS with zero policies means anon
-- and authenticated are blocked, while service_role bypasses RLS as designed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. system_heat materialized view
-- ---------------------------------------------------------------------------
-- Materialized views are not covered by table RLS, so an anon SELECT on
-- system_heat would bypass any RLS policies on the underlying `attestations`
-- table. Since the frontend never queries Supabase directly this grant is
-- unnecessary. service_role is unaffected by this revoke.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.system_heat FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. rls_auto_enable() — SECURITY DEFINER admin utility
-- ---------------------------------------------------------------------------
-- This function enables RLS on tables in the public schema and runs as the
-- definer (superuser-equivalent). It has no legitimate use case for anon or
-- authenticated callers; exposure via /rest/v1/rpc is a privilege-escalation
-- surface. Revoke execute; service_role and postgres roles retain access.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
