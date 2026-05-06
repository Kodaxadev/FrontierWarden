-- =============================================================================
-- 0016_identity_enrichment.sql
-- Batch identity enrichment foundation for Node Sentinel and API joins.
-- =============================================================================

CREATE TABLE IF NOT EXISTS identity_resolution_queue (
    wallet       VARCHAR(66) PRIMARY KEY,
    source       TEXT NOT NULL,
    priority     INTEGER NOT NULL DEFAULT 0,
    queued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_identity_resolution_queue_pending
    ON identity_resolution_queue (priority DESC, queued_at ASC)
    WHERE resolved_at IS NULL;

CREATE MATERIALIZED VIEW IF NOT EXISTS wallet_character_map AS
SELECT
    ei.wallet,
    ei.character_id,
    ei.character_name,
    ei.tribe_id,
    et.name AS tribe_name,
    ei.identity_status,
    ei.frontierwarden_profile_id,
    ei.synced_at
FROM eve_identities ei
LEFT JOIN eve_tribes et ON et.tribe_id = ei.tribe_id
WHERE ei.identity_status = 'resolved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_character_map_wallet
    ON wallet_character_map (wallet);

CREATE INDEX IF NOT EXISTS idx_wallet_character_map_character
    ON wallet_character_map (character_id);

ALTER TABLE identity_resolution_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON identity_resolution_queue FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON wallet_character_map FROM anon, authenticated;
