-- =============================================================================
-- 0008_lock_public_data_api.sql
-- Keep Supabase as the private indexer database.
--
-- FrontierWarden reads through the Rust API server, not directly through
-- Supabase's anon/authenticated Data API roles. RLS is already enabled on the
-- projection tables; this migration also removes the broad object privileges
-- those browser-facing roles inherited from earlier development.
-- =============================================================================

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated;
