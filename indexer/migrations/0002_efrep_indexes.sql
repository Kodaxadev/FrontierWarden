-- EVE Frontier Reputation Protocol — supplemental indexes
-- =============================================================================
-- Applied after 0001_efrep.sql once real query patterns are known.
--
-- Guiding principle: index what the API actually queries, not what might be
-- queried. Every index here corresponds to a route in api.rs.
-- =============================================================================

-- =============================================================================
-- 1. system_heat — unique index required for CONCURRENTLY refresh
-- -----------------------------------------------------------------------------
-- The materialized view is refreshed every 5 min by ingester::spawn_heat_refresh.
-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires at least one unique index;
-- without it Postgres falls back to a blocking full-table lock.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_heat_system_id
    ON system_heat (system_id);

-- =============================================================================
-- 2. attestations — (subject, issued_at DESC) for the /attestations/:subject route
-- -----------------------------------------------------------------------------
-- The handler orders by issued_at DESC with a LIMIT. The existing
-- idx_attestations_subject covers equality on subject but forces Postgres to
-- fetch-then-sort. Adding issued_at DESC makes the sort free.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_attestations_subject_time
    ON attestations (subject, issued_at DESC);

-- Compound filter used when ?schema_id= is provided:
CREATE INDEX IF NOT EXISTS idx_attestations_subject_schema_time
    ON attestations (subject, schema_id, issued_at DESC)
    WHERE NOT revoked;

-- =============================================================================
-- 3. singleton_attestations — (item_id, issued_at DESC) for /attestations/singleton/:item_id
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_singleton_item_time
    ON singleton_attestations (item_id, issued_at DESC)
    WHERE NOT revoked;

-- =============================================================================
-- 4. score_cache — profile_id covering index for /scores/:profile_id
-- -----------------------------------------------------------------------------
-- PK is (profile_id, schema_id); a full-profile scan reads all schemas for a
-- player. The PK already covers this, but an explicit covering index that
-- includes value + issuer avoids a heap fetch on the multi-schema endpoint.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_score_cache_profile_covering
    ON score_cache (profile_id)
    INCLUDE (schema_id, value, issuer, last_tx_digest, last_checkpoint);

-- =============================================================================
-- 5. raw_events — checkpoint_seq for replay range queries
-- -----------------------------------------------------------------------------
-- Operators use "give me all events between checkpoint X and Y" for debugging.
-- The partitioned table needs this on each partition; declaring on the parent
-- propagates to existing and future partitions automatically.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_raw_events_checkpoint
    ON raw_events (checkpoint_seq, created_at);

-- =============================================================================
-- 6. loans — (borrower, issued_at DESC) and (lender, issued_at DESC)
-- -----------------------------------------------------------------------------
-- Activity feeds for a player's loan history.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_loans_borrower_time
    ON loans (borrower, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_loans_lender_time
    ON loans (lender, issued_at DESC);

-- =============================================================================
-- 7. vouches — (voucher, created_at DESC) for outgoing vouch history
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_vouches_voucher_time
    ON vouches (voucher, created_at DESC);
