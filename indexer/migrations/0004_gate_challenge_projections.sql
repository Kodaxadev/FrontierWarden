-- Gate and fraud challenge projections.
--
-- These tables project operational events that are currently first-class
-- FrontierWarden product data. Some desired gate lifecycle operations
-- (create/pause/unpause/withdraw) do not emit Move events yet, so v0
-- projections cover PassageGranted, PassageDenied, GateConfigUpdated,
-- FraudChallengeCreated, and FraudChallengeResolved.

CREATE TABLE IF NOT EXISTS gate_config_updates (
    id                BIGSERIAL    PRIMARY KEY,
    gate_id           VARCHAR(66)  NOT NULL,
    ally_threshold    BIGINT       NOT NULL,
    base_toll_mist    BIGINT       NOT NULL,
    tx_digest         VARCHAR(64)  NOT NULL,
    event_seq         BIGINT       NOT NULL,
    checkpoint_seq    BIGINT       NOT NULL,
    indexed_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tx_digest, event_seq)
);

CREATE INDEX IF NOT EXISTS idx_gate_config_gate
    ON gate_config_updates (gate_id, indexed_at DESC);

CREATE TABLE IF NOT EXISTS gate_passages (
    id                BIGSERIAL    PRIMARY KEY,
    gate_id           VARCHAR(66)  NOT NULL,
    traveler          VARCHAR(66)  NOT NULL,
    allowed           BOOLEAN      NOT NULL,
    score             BIGINT,
    toll_paid         BIGINT,
    tier              SMALLINT,
    reason            SMALLINT,
    epoch             BIGINT       NOT NULL,
    tx_digest         VARCHAR(64)  NOT NULL,
    event_seq         BIGINT       NOT NULL,
    checkpoint_seq    BIGINT       NOT NULL,
    indexed_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tx_digest, event_seq)
);

CREATE INDEX IF NOT EXISTS idx_gate_passages_gate
    ON gate_passages (gate_id, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gate_passages_traveler
    ON gate_passages (traveler, indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gate_passages_denied
    ON gate_passages (indexed_at DESC) WHERE NOT allowed;
