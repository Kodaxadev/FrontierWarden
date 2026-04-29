-- =============================================================================
-- 0005_fix_view_security.sql
-- Fix SECURITY DEFINER on the three derived views flagged by the Supabase linter.
-- SECURITY INVOKER makes each view run under the calling role's permissions,
-- respecting RLS policies rather than bypassing them with the definer's rights.
-- =============================================================================

-- Live gate intel (the 7 gate-related schemas)
CREATE OR REPLACE VIEW gate_intel WITH (security_invoker = true) AS
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
CREATE OR REPLACE VIEW kill_mails WITH (security_invoker = true) AS
SELECT a.attestation_id AS kill_mail_id,
       a.subject        AS victim_id,
       a.issuer         AS killer_id,
       a.value          AS foam_value,
       a.issued_at,
       a.issued_tx
FROM attestations a
WHERE a.schema_id = 'SHIP_KILL';

-- Player bounties
CREATE OR REPLACE VIEW player_bounties WITH (security_invoker = true) AS
SELECT a.attestation_id AS bounty_id,
       a.subject        AS target,
       a.issuer,
       a.value          AS bounty_amount,
       a.issued_at,
       a.revoked
FROM attestations a
WHERE a.schema_id = 'PLAYER_BOUNTY';
