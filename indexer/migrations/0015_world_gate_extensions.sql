-- =============================================================================
-- 0015_world_gate_extensions.sql
-- Read-only current extension state for Stillness world Gate authorization.
--
-- Populated from world::gate ExtensionAuthorizedEvent / ExtensionRevokedEvent.
-- This table intentionally does not bind FrontierWarden GatePolicy objects to
-- world gates; it only records which extension TypeName is active per gate.
-- =============================================================================

CREATE TABLE IF NOT EXISTS world_gate_extensions (
    world_gate_id              VARCHAR(66) PRIMARY KEY,
    item_id                    BIGINT NOT NULL,
    tenant                     TEXT NOT NULL,
    extension_type             TEXT,
    previous_extension         TEXT,
    owner_cap_id               VARCHAR(66) NOT NULL,
    active                     BOOLEAN NOT NULL DEFAULT TRUE,
    authorized_tx_digest       TEXT,
    authorized_event_seq       BIGINT,
    authorized_checkpoint_seq  BIGINT,
    revoked_extension          TEXT,
    revoked_tx_digest          TEXT,
    revoked_event_seq          BIGINT,
    revoked_checkpoint_seq     BIGINT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_world_gate_extensions_tenant
    ON world_gate_extensions (tenant);

CREATE INDEX IF NOT EXISTS idx_world_gate_extensions_extension_type
    ON world_gate_extensions (extension_type);

CREATE INDEX IF NOT EXISTS idx_world_gate_extensions_active
    ON world_gate_extensions (active);

ALTER TABLE world_gate_extensions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON world_gate_extensions FROM anon, authenticated;
