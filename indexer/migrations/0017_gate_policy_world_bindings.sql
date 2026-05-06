-- =============================================================================
-- 0017_gate_policy_world_bindings.sql
-- Current active FrontierWarden GatePolicy -> EVE world Gate binding projection.
--
-- Populated only from reputation_gate binding/unbinding events. This is the
-- authoritative indexed edge used for topology warnings; world extension
-- authorization remains a separate proof signal.
-- =============================================================================

CREATE TABLE IF NOT EXISTS gate_policy_world_bindings (
    gate_policy_id       VARCHAR(66) PRIMARY KEY,
    world_gate_id        VARCHAR(66) NOT NULL,
    owner                VARCHAR(66) NOT NULL,
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    bound_tx_digest      VARCHAR(66),
    bound_event_seq      BIGINT,
    bound_checkpoint     BIGINT,
    unbound_tx_digest    VARCHAR(66),
    unbound_event_seq    BIGINT,
    unbound_checkpoint   BIGINT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gate_policy_world_bindings_world_gate
    ON gate_policy_world_bindings (world_gate_id);

CREATE INDEX IF NOT EXISTS idx_gate_policy_world_bindings_active
    ON gate_policy_world_bindings (active)
    WHERE active;

ALTER TABLE gate_policy_world_bindings ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON gate_policy_world_bindings FROM anon, authenticated;
