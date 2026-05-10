-- =============================================================================
-- 0019_world_gate_jumps.sql
-- Per-jump event log from JumpEvent world contract events (gate.move).
--
-- Each row is one JumpEvent: a character jumping from source_gate to
-- destination_gate. Deduplication key is (tx_digest, event_seq) — the natural
-- unique identity of a Sui event within a transaction.
-- =============================================================================

CREATE TABLE IF NOT EXISTS world_gate_jumps (
    tx_digest                   VARCHAR(66)  NOT NULL,
    event_seq                   BIGINT       NOT NULL,
    checkpoint                  BIGINT       NOT NULL,
    source_gate_id              VARCHAR(66)  NOT NULL,
    source_gate_item_id         BIGINT       NOT NULL,
    source_gate_tenant          TEXT         NOT NULL,
    destination_gate_id         VARCHAR(66)  NOT NULL,
    destination_gate_item_id    BIGINT       NOT NULL,
    destination_gate_tenant     TEXT         NOT NULL,
    character_id                VARCHAR(66)  NOT NULL,
    character_item_id           BIGINT       NOT NULL,
    character_tenant            TEXT         NOT NULL,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tx_digest, event_seq)
);

CREATE INDEX IF NOT EXISTS idx_world_gate_jumps_source
    ON world_gate_jumps (source_gate_id);

CREATE INDEX IF NOT EXISTS idx_world_gate_jumps_destination
    ON world_gate_jumps (destination_gate_id);

CREATE INDEX IF NOT EXISTS idx_world_gate_jumps_character
    ON world_gate_jumps (character_id);

CREATE INDEX IF NOT EXISTS idx_world_gate_jumps_checkpoint
    ON world_gate_jumps (checkpoint);

ALTER TABLE world_gate_jumps ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON world_gate_jumps FROM anon, authenticated;
