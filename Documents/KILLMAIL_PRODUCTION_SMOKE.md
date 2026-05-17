# Kill Mail Production Smoke — 2026-05-17

## Summary

Native EVE Frontier kill mail ingestion is live on Railway production.
The backfill completed successfully. The `/kill-mails` API is returning real rows.
The frontend killboard renders and updates live without a manual page refresh.
No score or reputation values were mutated by this feature.

---

## PRs Involved

| PR | Branch | Description |
|---|---|---|
| [#33](https://github.com/Kodaxadev/FrontierWarden/pull/33) | `codex/kill-mail-api` | Five read-only API endpoints backed by `world_kill_mails`; cursor-based keyset pagination (id DESC, max 200/page) |
| [#34](https://github.com/Kodaxadev/FrontierWarden/pull/34) | `codex/killboard-native-migration` | Frontend killboard migrated from SHIP_KILL attestation feed to native kill mails as primary source; SHIP_KILL retained as secondary ATTESTED badge overlay |
| [#35](https://github.com/Kodaxadev/FrontierWarden/pull/35) | `codex/killboard-dossier-evidence-model` | Combat Evidence panel added to ReputationView trust dossier; kills/losses per address; ADR-compliant copy |
| [#36](https://github.com/Kodaxadev/FrontierWarden/pull/36) | `codex/kill-mail-poller-env-toggle` | `EFREP_KILL_MAILS_ENABLED` env var override — enables poller at Railway runtime without editing config.toml |

---

## Env Flag

```
EFREP_KILL_MAILS_ENABLED=true
```

Set via Railway CLI (`railway variables set`) on the **EF-Indexer / production** service, 2026-05-17.
The flag was not previously set; the poller was disabled by default (`kill_mails.enabled = false` in config.toml).

---

## Poller Source

- **Provider:** Alpha-Strike community API — `https://api.alpha-strike.space/incident`
- **Environment tag:** `stillness`
- **Poll interval:** 30 seconds (idle)
- **Page size:** 200 records/page (offset pagination toward upstream API)

---

## Backfill Result

Indexer log on startup after Railway redeploy:

```
2026-05-17T16:51:14Z INFO efrep_indexer::db: Migration already applied; skipping migration=0021_world_kill_mails.sql
2026-05-17T16:51:15Z INFO efrep_indexer::kill_mail_poller: kill mail backfill starting (cursor=0, ingesting full history)
```

Backfill ran from `cursor=0` (full history). Records began appearing in `world_kill_mails` within seconds.

---

## Endpoint Smoke

```
GET https://ef-indexer-production.up.railway.app/kill-mails?limit=10
```

Response (abbreviated):

```json
{
  "items": [
    {
      "killMailId": 116,
      "sourceId": 10093,
      "environment": "stillness",
      "killerName": "Cassius",
      "killerAddress": "a8ea9bd77975033a5473a9ac829225e81ba70294",
      "killerTribe": "Silver",
      "victimName": "Lucin",
      "victimAddress": "191b402b55819571bc650e0a48f53c0836f8d38d",
      "victimTribe": "Clonebank 86",
      "solarSystemId": 30009552,
      "solarSystemName": "D:1ER6",
      "lossType": "ship/structure",
      "killTimestamp": "2026-03-03T04:41:42+00:00",
      "indexedAt": "2026-05-17T16:51:29.603950+00:00"
    }
  ],
  "total": 10,
  "nextCursor": "MTA3",
  "dataNote": "Native kill mail data is combat telemetry. ..."
}
```

- Pagination: `nextCursor` present, keyset on `id DESC`
- All fields populated: killer, victim, tribe, system, lossType, timestamps
- `dataNote` present on all list responses per ADR requirement

---

## Frontend Render

- Killboard view (`/killboard` tab in FrontierWarden) renders native kill mails without a manual page refresh
- Live polling interval updates the feed as new records are indexed
- Columns: Time · Killer · Victim · System · Loss Type · Status
- ATTESTED badge appears where a SHIP_KILL attestation covers the same victim address (conservative match)

---

## No Score / Reputation Mutation

Native kill mail ingestion does **not** modify any score, attestation, or trust value:

- No writes to `world_attestations`, `world_scores`, or any trust table
- Kill data is read-only combat telemetry
- Reputation changes require explicit oracle attestation or operator policy action
- This is enforced by the three-layer model in `Documents/ADR_KILLMAILS_AS_TRUST_EVIDENCE.md`

---

## SHIP_KILL as Secondary Evidence

SHIP_KILL oracle attestations remain the authoritative trust-layer signal for kill verification:

- Served by `/attestations?schema_id=SHIP_KILL`
- Feed separately from `/kill-mails`
- Used only as an ATTESTED overlay badge in the killboard UI
- The ATTESTED badge means "a related SHIP_KILL attestation covers this victim address" — not that this exact kill mail has been verified by an oracle

---

## Architecture Reference

- `Documents/ADR_KILLMAILS_AS_TRUST_EVIDENCE.md` — three-layer model, rules against auto-scoring
- `Documents/KILLMAIL_API.md` — full endpoint reference
- `indexer/src/kill_mail_poller.rs` — ingestion logic
- `indexer/src/api_kill_mails.rs` — API handlers
- `frontend/src/components/features/frontierwarden/views/KillboardView.tsx` — killboard UI
- `frontend/src/components/features/frontierwarden/CombatEvidencePanel.tsx` — dossier panel
