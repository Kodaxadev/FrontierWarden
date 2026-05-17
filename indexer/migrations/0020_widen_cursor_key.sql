-- World event cursor keys include a full Sui address plus module and event name,
-- e.g. "cursor:world:0x28b4...448c::gate::ExtensionAuthorizedEvent" (~111 chars).
-- The original VARCHAR(64) was too narrow; widen to TEXT for existing deployments.
ALTER TABLE indexer_state ALTER COLUMN key TYPE TEXT;
