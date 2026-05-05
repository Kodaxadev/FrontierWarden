-- =============================================================================
-- 0011_eve_identity_status.sql
-- EVE Identity Resolution v0.1 — add identity_status tracking.
-- =============================================================================

ALTER TABLE eve_identities ADD COLUMN IF NOT EXISTS identity_status TEXT NOT NULL DEFAULT 'unverified';

CREATE INDEX IF NOT EXISTS idx_eve_identities_status
    ON eve_identities (identity_status);
