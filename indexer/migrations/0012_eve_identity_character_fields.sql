-- =============================================================================
-- 0012_eve_identity_character_fields.sql
-- EVE Identity Resolution v0.2 — Character enrichment fields.
--
-- Adds columns for character_name, tenant, and item_id extracted from the
-- Character object via Sui GraphQL lookup. These are optional enrichment
-- fields; identity_status = "resolved" requires only PlayerProfile + character_id.
--
-- character_address and owner_cap_id are preserved in raw.character JSON.
-- =============================================================================

ALTER TABLE public.eve_identities ADD COLUMN IF NOT EXISTS character_name TEXT;
ALTER TABLE public.eve_identities ADD COLUMN IF NOT EXISTS tenant TEXT;
ALTER TABLE public.eve_identities ADD COLUMN IF NOT EXISTS item_id TEXT;

CREATE INDEX IF NOT EXISTS idx_eve_identities_tenant ON public.eve_identities (tenant);
CREATE INDEX IF NOT EXISTS idx_eve_identities_character_name ON public.eve_identities (character_name);
