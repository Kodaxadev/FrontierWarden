-- Native EVE Frontier kill mail records (ingested from alpha-strike community API)
-- Kill mail poller is disabled by default; enable via [kill_mails] enabled = true in config.
CREATE TABLE IF NOT EXISTS world_kill_mails (
    id                  BIGSERIAL   PRIMARY KEY,
    source_id           BIGINT      NOT NULL,
    environment         TEXT        NOT NULL DEFAULT 'stillness',
    victim_name         TEXT,
    victim_address      TEXT,
    victim_tribe        TEXT,
    killer_name         TEXT,
    killer_address      TEXT,
    killer_tribe        TEXT,
    solar_system_id     BIGINT,
    solar_system_name   TEXT,
    loss_type           TEXT,
    kill_time           TIMESTAMPTZ,
    raw_json            JSONB,
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, environment)
);

CREATE INDEX IF NOT EXISTS world_kill_mails_env_time    ON world_kill_mails (environment, kill_time DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS world_kill_mails_victim_name ON world_kill_mails (victim_name);
CREATE INDEX IF NOT EXISTS world_kill_mails_killer_name ON world_kill_mails (killer_name);
CREATE INDEX IF NOT EXISTS world_kill_mails_system      ON world_kill_mails (solar_system_id);
