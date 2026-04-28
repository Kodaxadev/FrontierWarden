-- EVE Frontier Reputation Protocol — raw_events partition runway extension
-- =============================================================================
-- 0001_efrep.sql created partitions for 2026-04 through 2026-06.
-- This migration extends coverage through 2027-12 (18 months of runway),
-- buying time before pg_partman or a cron-based maintenance job is needed.
--
-- Run order: after 0002_efrep_indexes.sql
-- Idempotent: IF NOT EXISTS guards prevent errors on re-run.
-- =============================================================================

-- 2026
CREATE TABLE IF NOT EXISTS raw_events_2026_07 PARTITION OF raw_events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS raw_events_2026_08 PARTITION OF raw_events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE IF NOT EXISTS raw_events_2026_09 PARTITION OF raw_events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS raw_events_2026_10 PARTITION OF raw_events
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS raw_events_2026_11 PARTITION OF raw_events
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS raw_events_2026_12 PARTITION OF raw_events
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 2027
CREATE TABLE IF NOT EXISTS raw_events_2027_01 PARTITION OF raw_events
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_02 PARTITION OF raw_events
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_03 PARTITION OF raw_events
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_04 PARTITION OF raw_events
    FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_05 PARTITION OF raw_events
    FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_06 PARTITION OF raw_events
    FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_07 PARTITION OF raw_events
    FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_08 PARTITION OF raw_events
    FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_09 PARTITION OF raw_events
    FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_10 PARTITION OF raw_events
    FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_11 PARTITION OF raw_events
    FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE IF NOT EXISTS raw_events_2027_12 PARTITION OF raw_events
    FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- =============================================================================
-- ACTION REQUIRED before December 2027:
-- Either extend this file with another year of partitions, or install pg_partman
-- and configure run_maintenance_proc on a cron/BGW to automate future creation.
-- Reference: https://github.com/pgpartman/pg_partman
-- =============================================================================
