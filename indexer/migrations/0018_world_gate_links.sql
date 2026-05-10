-- =============================================================================
-- 0018_world_gate_links.sql
-- Bidirectional gate link topology indexed from GateLinkedEvent /
-- GateUnlinkedEvent world contract events.
--
-- Each event pair produces two rows (source→dest and dest→source) so
-- active_links_for_gate(gate_id) is a simple WHERE source_gate_id = $1.
-- On GateUnlinkedEvent both directions are marked inactive in place.
-- =============================================================================

CREATE TABLE IF NOT EXISTS world_gate_links (
    source_gate_id              VARCHAR(66)  NOT NULL,
    destination_gate_id         VARCHAR(66)  NOT NULL,
    source_gate_item_id         BIGINT       NOT NULL,
    source_gate_tenant          TEXT         NOT NULL,
    destination_gate_item_id    BIGINT       NOT NULL,
    destination_gate_tenant     TEXT         NOT NULL,
    linked_at_checkpoint        BIGINT       NOT NULL,
    unlinked_at_checkpoint      BIGINT,
    is_active                   BOOLEAN      NOT NULL DEFAULT TRUE,
    tx_digest                   VARCHAR(66),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    PRIMARY KEY (source_gate_id, destination_gate_id)
);

CREATE INDEX IF NOT EXISTS idx_world_gate_links_source
    ON world_gate_links (source_gate_id);

CREATE INDEX IF NOT EXISTS idx_world_gate_links_destination
    ON world_gate_links (destination_gate_id);

CREATE INDEX IF NOT EXISTS idx_world_gate_links_active
    ON world_gate_links (is_active)
    WHERE is_active = TRUE;

ALTER TABLE world_gate_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON world_gate_links FROM anon, authenticated;

-- Convenience view: only active (currently linked) gate pairs.
CREATE OR REPLACE VIEW world_gate_links_active AS
    SELECT *
    FROM world_gate_links
    WHERE is_active = TRUE;
