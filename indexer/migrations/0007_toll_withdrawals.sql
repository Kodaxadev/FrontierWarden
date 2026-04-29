-- Toll withdrawal projection for reputation_gate::TollsWithdrawn.
-- Withdrawals are operationally important because they move treasury funds
-- without changing gate policy or passage history.

CREATE TABLE IF NOT EXISTS toll_withdrawals (
    id                BIGSERIAL    PRIMARY KEY,
    gate_id           VARCHAR(66)  NOT NULL,
    owner             VARCHAR(66)  NOT NULL,
    amount_mist       BIGINT       NOT NULL,
    tx_digest         VARCHAR(64)  NOT NULL,
    event_seq         BIGINT       NOT NULL,
    checkpoint_seq    BIGINT       NOT NULL,
    indexed_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tx_digest, event_seq)
);

CREATE INDEX IF NOT EXISTS idx_toll_withdrawals_gate
    ON toll_withdrawals (gate_id, indexed_at DESC);

CREATE INDEX IF NOT EXISTS idx_toll_withdrawals_owner
    ON toll_withdrawals (owner, indexed_at DESC);
