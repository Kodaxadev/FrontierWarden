-- =============================================================================
-- 0009_raw_event_dedup.sql
-- Replay guard for the partitioned raw_events firehose.
--
-- raw_events is partitioned by created_at, so a unique index must include the
-- partition key. That makes the original (tx_digest, event_seq, created_at)
-- index insufficient for replay idempotency. This small ledger provides the
-- true one-row-per-Sui-event guard.
-- =============================================================================

CREATE TABLE IF NOT EXISTS raw_event_dedup (
    tx_digest     VARCHAR(64) NOT NULL,
    event_seq     BIGINT      NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tx_digest, event_seq)
);

INSERT INTO raw_event_dedup (tx_digest, event_seq, first_seen_at)
SELECT DISTINCT ON (tx_digest, event_seq)
       tx_digest, event_seq, created_at
FROM raw_events
ORDER BY tx_digest, event_seq, created_at
ON CONFLICT (tx_digest, event_seq) DO NOTHING;

ALTER TABLE raw_event_dedup ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON raw_event_dedup FROM anon, authenticated;
