-- =============================================================================
-- 0013_world_gates.sql
-- Read-only Stillness world gate object projection.
--
-- Populated by the `sync_world_gates` CLI binary from Sui GraphQL object reads.
-- Gate links and jump events are intentionally deferred to later topology steps.
-- =============================================================================

CREATE TABLE IF NOT EXISTS world_gates (
    gate_id              VARCHAR(66) PRIMARY KEY,
    item_id              BIGINT NOT NULL,
    tenant               TEXT NOT NULL,
    owner_character_id   VARCHAR(66),
    owner_address        VARCHAR(66),
    solar_system_id      TEXT,
    linked_gate_id       VARCHAR(66),
    status               TEXT NOT NULL DEFAULT 'unknown',
    fw_extension_active  BOOLEAN NOT NULL DEFAULT FALSE,
    fw_gate_policy_id    VARCHAR(66),
    checkpoint_updated   BIGINT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_world_gates_tenant
    ON world_gates (tenant);

CREATE INDEX IF NOT EXISTS idx_world_gates_linked_gate
    ON world_gates (linked_gate_id);

CREATE INDEX IF NOT EXISTS idx_world_gates_fw_extension
    ON world_gates (fw_extension_active);

CREATE INDEX IF NOT EXISTS idx_world_gates_fw_policy
    ON world_gates (fw_gate_policy_id);

ALTER TABLE world_gates ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON world_gates FROM anon, authenticated;
