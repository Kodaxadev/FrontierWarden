-- Trust API v1 performance indexes
-- =============================================================================
-- Covers the query paths used by evaluate_gate_access, evaluate_counterparty_risk,
-- add_challenge_warning, and add_freshness_warnings.
-- =============================================================================

-- Gate policy lookup: WHERE gate_id = $1 ORDER BY checkpoint_seq DESC, indexed_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_gcu_gate_latest
    ON gate_config_updates (gate_id, checkpoint_seq DESC, indexed_at DESC);

-- Standing attestation lookup: WHERE subject = $1 AND schema_id = $2 AND NOT revoked ORDER BY issued_at DESC
CREATE INDEX IF NOT EXISTS idx_attestations_standing
    ON attestations (subject, schema_id, issued_at DESC) WHERE NOT revoked;

-- Fraud challenge lookup: WHERE attestation_id = $1 AND NOT resolved
CREATE INDEX IF NOT EXISTS idx_fraud_attestation_unresolved
    ON fraud_challenges (attestation_id) WHERE NOT resolved;

-- Freshness query: MAX(checkpoint_seq), MAX(created_at) on raw_events
CREATE INDEX IF NOT EXISTS idx_raw_events_checkpoint
    ON raw_events (checkpoint_seq DESC, created_at DESC);

-- Attestation checkpoint join: WHERE tx_digest = $1 on raw_events (used by standing attestation query)
CREATE INDEX IF NOT EXISTS idx_raw_events_tx_digest
    ON raw_events (tx_digest);
