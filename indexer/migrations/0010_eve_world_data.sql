-- =============================================================================
-- 0010_eve_world_data.sql
-- EVE Native Bridge v0.1 — metadata sync tables.
--
-- Populated by the `sync_eve_world` CLI binary from the EVE Frontier World API.
-- gateLinks is intentionally NOT modeled (field exists but is empty on Cycle 5).
-- =============================================================================

-- Sync state ledger for World API pagination / last-sync timestamps.
CREATE TABLE IF NOT EXISTS eve_world_sync_state (
    key        VARCHAR(128) PRIMARY KEY,
    value      TEXT,
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solar systems from /v2/solarsystems.
-- gateLinks is NOT extracted (empty on testnet as of Cycle 5).
CREATE TABLE IF NOT EXISTS eve_solar_systems (
    system_id  TEXT PRIMARY KEY,
    name       TEXT,
    raw        JSONB NOT NULL,
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eve_solar_systems_name
    ON eve_solar_systems (name);

-- Tribes from /v2/tribes.
CREATE TABLE IF NOT EXISTS eve_tribes (
    tribe_id   TEXT PRIMARY KEY,
    name       TEXT,
    raw        JSONB NOT NULL,
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eve_tribes_name
    ON eve_tribes (name);

-- Ships from /v2/ships.
CREATE TABLE IF NOT EXISTS eve_ships (
    ship_id             TEXT PRIMARY KEY,
    owner_character_id  TEXT,
    type_id             TEXT,
    name                TEXT,
    raw                 JSONB NOT NULL,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eve_ships_owner_character
    ON eve_ships (owner_character_id);

CREATE INDEX IF NOT EXISTS idx_eve_ships_type
    ON eve_ships (type_id);

-- Types from /v2/types.
CREATE TABLE IF NOT EXISTS eve_types (
    type_id      TEXT PRIMARY KEY,
    name         TEXT,
    group_id     TEXT,
    category_id  TEXT,
    raw          JSONB NOT NULL,
    synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eve_types_name
    ON eve_types (name);

-- Identity cache: wallet → PlayerProfile → character_id.
-- Populated by GraphQL lookup (eve_identity module).
-- frontierwarden_profile_id links to the profiles table.
CREATE TABLE IF NOT EXISTS eve_identities (
    wallet                     VARCHAR(66) PRIMARY KEY,
    player_profile_object      VARCHAR(66),
    character_id               TEXT,
    character_object           VARCHAR(66),
    tribe_id                   TEXT,
    frontierwarden_profile_id  VARCHAR(66),
    raw                        JSONB,
    synced_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eve_identities_character
    ON eve_identities (character_id);

CREATE INDEX IF NOT EXISTS idx_eve_identities_tribe
    ON eve_identities (tribe_id);

-- RLS / Supabase lock-down.
ALTER TABLE eve_world_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE eve_solar_systems  ENABLE ROW LEVEL SECURITY;
ALTER TABLE eve_tribes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE eve_ships          ENABLE ROW LEVEL SECURITY;
ALTER TABLE eve_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE eve_identities     ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON eve_world_sync_state FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON eve_solar_systems  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON eve_tribes         FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON eve_ships          FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON eve_types          FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON eve_identities     FROM anon, authenticated;
