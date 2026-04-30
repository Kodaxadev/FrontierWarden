-- Initial FrontierWarden projection schema.
-- =============================================================================
-- Historical package IDs are recorded in TESTNET_NOTES / PROOF_LOG.
-- Current deployment target: Sui testnet.
--
-- Convention: Sui addresses and object IDs are 32 bytes, rendered as
-- '0x' + 64 hex chars = 66 chars total. Tx digests are base58-encoded
-- and fit comfortably in VARCHAR(64). Move u64 values map to BIGINT
-- (Postgres int8 covers our value range; if we ever need full unsigned
-- u64, switch to NUMERIC(20,0)).

-- =============================================================================
-- 1. raw_events — append-only firehose, partitioned monthly
-- -----------------------------------------------------------------------------
-- Every Sui event lands here first as a JSONB blob. Per-event-type tables
-- below are projections; raw_events is the replay log + audit source.
-- Partition key is created_at; new monthly partitions need to be created
-- ahead of time (cron / pg_partman / manual). See README.
-- =============================================================================

CREATE TABLE raw_events (
    id              BIGSERIAL,
    chain           VARCHAR(8)   NOT NULL,    -- 'sui'; future: 'evm' for MUD
    package_id      VARCHAR(66)  NOT NULL,
    module_name     VARCHAR(64)  NOT NULL,
    event_type      VARCHAR(64)  NOT NULL,
    tx_digest       VARCHAR(64)  NOT NULL,
    event_seq       BIGINT       NOT NULL,    -- index of event within tx
    checkpoint_seq  BIGINT       NOT NULL,
    sender          VARCHAR(66),
    timestamp_ms    BIGINT,                    -- ms since epoch (from Sui)
    payload         JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Initial partitions (extend forward via ops cron)
CREATE TABLE raw_events_2026_04 PARTITION OF raw_events
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE raw_events_2026_05 PARTITION OF raw_events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE raw_events_2026_06 PARTITION OF raw_events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Idempotency on replay: same (tx_digest, event_seq) must not insert twice
CREATE UNIQUE INDEX idx_raw_events_uniq    ON raw_events (tx_digest, event_seq, created_at);
CREATE INDEX        idx_raw_events_type    ON raw_events (event_type);
CREATE INDEX        idx_raw_events_module  ON raw_events (module_name, event_type);
CREATE INDEX        idx_raw_events_sender  ON raw_events (sender);
CREATE INDEX        idx_raw_events_payload ON raw_events USING GIN (payload jsonb_path_ops);

-- =============================================================================
-- 2. schemas — schema_registry::SchemaRegistered (mutated by Deprecated)
-- =============================================================================

CREATE TABLE schemas (
    schema_id        VARCHAR(64)  PRIMARY KEY,    -- ASCII e.g. 'GATE_HOSTILE'
    version          BIGINT       NOT NULL,
    resolver         VARCHAR(66),                  -- Option<address> -> nullable
    deprecated_by    VARCHAR(64)  REFERENCES schemas(schema_id),
    registered_tx    VARCHAR(64)  NOT NULL,
    registered_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deprecated_tx    VARCHAR(64),
    deprecated_at    TIMESTAMPTZ
);

CREATE INDEX idx_schemas_active ON schemas (schema_id) WHERE deprecated_at IS NULL;

-- =============================================================================
-- 3. governance_history — schema_registry::GovernanceTransferred
-- =============================================================================

CREATE TABLE governance_history (
    id              BIGSERIAL    PRIMARY KEY,
    old_admin       VARCHAR(66),                   -- Option<address>
    new_governance  VARCHAR(66)  NOT NULL,
    tx_digest       VARCHAR(64)  NOT NULL,
    transferred_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. profiles — profile::ProfileCreated
-- =============================================================================

CREATE TABLE profiles (
    profile_id      VARCHAR(66)  PRIMARY KEY,
    owner           VARCHAR(66)  NOT NULL,
    created_tx      VARCHAR(64)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_profiles_owner ON profiles (owner);

-- =============================================================================
-- 5. score_cache — current ScoreUpdated state per (profile, schema)
-- -----------------------------------------------------------------------------
-- No FK to profiles: ScoreUpdated can in theory arrive before ProfileCreated
-- if checkpoints replay out of strict order. The on-chain logic is the
-- source of truth; this table is a derived cache.
-- =============================================================================

CREATE TABLE score_cache (
    profile_id      VARCHAR(66)  NOT NULL,
    schema_id       VARCHAR(64)  NOT NULL REFERENCES schemas(schema_id),
    value           BIGINT       NOT NULL,
    issuer          VARCHAR(66)  NOT NULL,
    last_tx_digest  VARCHAR(64)  NOT NULL,
    last_checkpoint BIGINT       NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (profile_id, schema_id)
);

CREATE INDEX idx_score_cache_schema ON score_cache (schema_id, value DESC);
CREATE INDEX idx_score_cache_issuer ON score_cache (issuer);

-- =============================================================================
-- 6. attestations — attestation::AttestationIssued + AttestationRevoked
-- =============================================================================

CREATE TABLE attestations (
    attestation_id  VARCHAR(66)  PRIMARY KEY,
    schema_id       VARCHAR(64)  NOT NULL REFERENCES schemas(schema_id),
    issuer          VARCHAR(66)  NOT NULL,
    subject         VARCHAR(66)  NOT NULL,
    value           BIGINT       NOT NULL,
    issued_tx       VARCHAR(64)  NOT NULL,
    issued_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    revoked         BOOLEAN      NOT NULL DEFAULT FALSE,
    revoker         VARCHAR(66),
    revoked_tx      VARCHAR(64),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_attestations_schema  ON attestations (schema_id);
CREATE INDEX idx_attestations_subject ON attestations (subject);
CREATE INDEX idx_attestations_issuer  ON attestations (issuer);
CREATE INDEX idx_attestations_active  ON attestations (schema_id, subject) WHERE NOT revoked;

-- =============================================================================
-- 7. singleton_attestations — singleton::SingletonAttestationIssued + Revoked
-- -----------------------------------------------------------------------------
-- Item-level attestations (ship provenance, battle history). Subject is
-- an item_id (object ID), not a player address.
-- =============================================================================

CREATE TABLE singleton_attestations (
    attestation_id  VARCHAR(66)  PRIMARY KEY,
    schema_id       VARCHAR(64)  NOT NULL REFERENCES schemas(schema_id),
    item_id         VARCHAR(66)  NOT NULL,
    issuer          VARCHAR(66)  NOT NULL,
    value           BIGINT       NOT NULL,
    issued_tx       VARCHAR(64)  NOT NULL,
    issued_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    revoked         BOOLEAN      NOT NULL DEFAULT FALSE,
    revoker         VARCHAR(66),
    revoked_tx      VARCHAR(64),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_singleton_item   ON singleton_attestations (item_id);
CREATE INDEX idx_singleton_schema ON singleton_attestations (schema_id);

-- =============================================================================
-- 8. system_attestations — system_sdk::SystemAttestationEvent
-- -----------------------------------------------------------------------------
-- One-shot writes from in-game contracts (CradleOS, Blood Contract, Bazaar).
-- These don't have a Revoked counterpart; they're append-only score writes.
-- =============================================================================

CREATE TABLE system_attestations (
    id              BIGSERIAL    PRIMARY KEY,
    schema_id       VARCHAR(64)  NOT NULL REFERENCES schemas(schema_id),
    subject         VARCHAR(66)  NOT NULL,
    value           BIGINT       NOT NULL,
    system_oracle   VARCHAR(66)  NOT NULL,
    sui_timestamp   BIGINT       NOT NULL,    -- on-chain epoch from event
    tx_digest       VARCHAR(64)  NOT NULL,
    indexed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tx_digest, schema_id, subject)
);

CREATE INDEX idx_sysattest_subject ON system_attestations (subject, schema_id);
CREATE INDEX idx_sysattest_oracle  ON system_attestations (system_oracle);

-- =============================================================================
-- 9. oracles — oracle_registry::OracleRegistered
-- =============================================================================

CREATE TABLE oracles (
    oracle_address    VARCHAR(66)  PRIMARY KEY,
    name              TEXT         NOT NULL,
    tee_verified      BOOLEAN      NOT NULL,
    is_system_oracle  BOOLEAN      NOT NULL,
    registered_tx     VARCHAR(64)  NOT NULL,
    registered_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 10. fraud_challenges — oracle_registry::FraudChallengeCreated + Resolved
-- =============================================================================

CREATE TABLE fraud_challenges (
    challenge_id    VARCHAR(66)  PRIMARY KEY,
    attestation_id  VARCHAR(66)  NOT NULL,
    challenger      VARCHAR(66)  NOT NULL,
    oracle          VARCHAR(66)  NOT NULL,
    created_tx      VARCHAR(64)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved        BOOLEAN      NOT NULL DEFAULT FALSE,
    guilty          BOOLEAN,
    slash_amount    BIGINT,
    resolved_tx     VARCHAR(64),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_fraud_oracle      ON fraud_challenges (oracle);
CREATE INDEX idx_fraud_attestation ON fraud_challenges (attestation_id);
CREATE INDEX idx_fraud_unresolved  ON fraud_challenges (created_at) WHERE NOT resolved;

-- =============================================================================
-- 11. vouches — vouch::VouchCreated + VouchRedeemed
-- =============================================================================

CREATE TABLE vouches (
    vouch_id        VARCHAR(66)  PRIMARY KEY,
    voucher         VARCHAR(66)  NOT NULL,
    vouchee         VARCHAR(66)  NOT NULL,
    stake_amount    BIGINT       NOT NULL,
    created_tx      VARCHAR(64)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    redeemed        BOOLEAN      NOT NULL DEFAULT FALSE,
    amount_returned BIGINT,
    redeemed_tx     VARCHAR(64),
    redeemed_at     TIMESTAMPTZ
);

CREATE INDEX idx_vouches_voucher ON vouches (voucher);
CREATE INDEX idx_vouches_vouchee ON vouches (vouchee);
CREATE INDEX idx_vouches_active  ON vouches (vouchee) WHERE NOT redeemed;

-- =============================================================================
-- 12. loans — lending::LoanIssued + LoanRepaid + LoanDefaulted
-- =============================================================================

CREATE TABLE loans (
    loan_id         VARCHAR(66)  PRIMARY KEY,
    borrower        VARCHAR(66)  NOT NULL,
    lender          VARCHAR(66)  NOT NULL,
    amount          BIGINT       NOT NULL,
    issued_tx       VARCHAR(64)  NOT NULL,
    issued_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    repaid          BOOLEAN      NOT NULL DEFAULT FALSE,
    repaid_tx       VARCHAR(64),
    repaid_at       TIMESTAMPTZ,
    defaulted       BOOLEAN      NOT NULL DEFAULT FALSE,
    defaulted_tx    VARCHAR(64),
    defaulted_at    TIMESTAMPTZ,
    vouch_slashed   BIGINT
);

CREATE INDEX idx_loans_borrower ON loans (borrower);
CREATE INDEX idx_loans_lender   ON loans (lender);
CREATE INDEX idx_loans_active   ON loans (issued_at) WHERE NOT repaid AND NOT defaulted;

-- =============================================================================
-- VIEWS — schema-driven projections over `attestations`
-- -----------------------------------------------------------------------------
-- These match the "tables" named in the architecture doc but are kept as
-- views in v1 so we don't dual-write. Materialize them later if query
-- patterns demand it (e.g. join-heavy killboard queries).
-- =============================================================================

-- Live gate intel (the 7 gate-related schemas)
CREATE OR REPLACE VIEW gate_intel AS
SELECT a.attestation_id,
       a.schema_id,
       a.subject AS system_id,
       a.issuer,
       a.value,
       a.issued_at,
       a.revoked,
       a.revoked_at
FROM attestations a
WHERE a.schema_id IN (
    'GATE_HOSTILE', 'GATE_CAMPED', 'GATE_CLEAR', 'GATE_TOLL',
    'HEAT_TRAP', 'ROUTE_VERIFIED', 'SYSTEM_CONTESTED'
);

-- Kill mails (SHIP_KILL is non-revocable per protocol; revoked filter omitted)
CREATE OR REPLACE VIEW kill_mails AS
SELECT a.attestation_id AS kill_mail_id,
       a.subject        AS victim_id,
       a.issuer         AS killer_id,
       a.value          AS foam_value,
       a.issued_at,
       a.issued_tx
FROM attestations a
WHERE a.schema_id = 'SHIP_KILL';

-- Player bounties
CREATE OR REPLACE VIEW player_bounties AS
SELECT a.attestation_id AS bounty_id,
       a.subject        AS target,
       a.issuer,
       a.value          AS bounty_amount,
       a.issued_at,
       a.revoked
FROM attestations a
WHERE a.schema_id = 'PLAYER_BOUNTY';
