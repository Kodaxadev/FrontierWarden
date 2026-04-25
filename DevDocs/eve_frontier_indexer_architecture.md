
# EVE FRONTIER TRIBAL INTELLIGENCE LAYER
## Indexer Architecture Specification

---

## DESIGN PRINCIPLES

1. **Dual-chain ingestion** — EVM (MUD tables, current) + Sui (Move events, future)
2. **Event-driven, not poll-driven** — sub-block latency vs EF-Map's batch cron [^29^]
3. **Composable data layers** — raw events → processed intel → aggregated scores
4. **Tribe-sovereign filtering** — same raw data, different views per syndicate
5. **Open source the indexer** — EF-Map's is closed; yours is a public good that attracts developers

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐  │
│  │   EVM (MUD Tables)  │    │   Sui (Move Events) │    │  External APIs  │  │
│  │  - Smart Gate adj   │    │  - Attestations     │    │  - EF-Map scrape│  │
│  │  - Kill mail events │    │  - Score updates    │    │  - CCP world API│  │
│  │  - Character data   │    │  - Oracle reg       │    │  - Market data  │  │
│  └──────────┬──────────┘    └──────────┬──────────┘    └────────┬────────┘  │
└─────────────┼──────────────────────────┼────────────────────────┼───────────┘
              │                          │                        │
              ▼                          ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INGESTION LAYER (Rust)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  sui-indexer-core (forked from longcipher/sui-indexer) [^122^]       │     │
│  │  - gRPC streaming for Sui events                                    │     │
│  │  - MUD event listener for EVM (Anvil/Foundry)                       │     │
│  │  - Checkpoint-based ingestion with resume capability                │     │
│  │  - Configurable event filters per schema                            │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROCESSING LAYER (Rust + WebAssembly)                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │  Event Router   │  │  Score Computer │  │  Intel Merger   │               │
│  │  - Route events │  │  - Aggregate    │  │  - Merge EVM    │               │
│  │    to handlers  │  │    attestations │  │    + Sui data   │               │
│  │  - Filter by    │  │  - Compute      │  │  - Apply tribe  │               │
│  │    tribe/synd   │  │    reputation   │  │    filters      │               │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STORAGE LAYER                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │  PostgreSQL     │  │  Redis          │  │  IPFS           │               │
│  │  - Raw events   │  │  - Hot cache    │  │  - Permanent    │               │
│  │  - Processed    │  │  - Session data │  │    attestations │               │
│  │    intel        │  │  - Rate limits  │  │  - Audit trail  │               │
│  │  - Route graphs │  │                 │  │                 │               │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      API LAYER (Rust/Axum or Node/Express)                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │  GraphQL        │  │  REST           │  │  WebSocket      │               │
│  │  - Complex      │  │  - Simple       │  │  - Live intel   │               │
│  │    queries      │  │    queries      │  │    stream       │               │
│  │  - Aggregations │  │  - Caching      │  │  - Push to      │               │
│  │                 │  │                 │  │    clients      │               │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │  Web App        │  │  Mobile PWA     │  │  Smart Assemblies│              │
│  │  (React/Canvas) │  │  (Star map)     │  │  (Move/Solidity) │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## INGESTION LAYER: DETAILED SPEC

### Sui Event Ingestion (Move Events)

Your protocol emits these events (defined in v4 modules):

```move
// From profile.move
public struct ScoreUpdated has copy, drop {
    profile_id: address,
    schema_id: vector<u8>,
    old_value: u64,
    new_value: u64,
    issuer: address,
}

// From attestation.move
public struct AttestationIssued has copy, drop {
    attestation_id: ID,
    schema_id: vector<u8>,
    issuer: address,
    subject: address,
    value: u64,
}

// From oracle_registry.move
public struct FraudChallengeCreated has copy, drop {
    challenge_id: address,
    attestation_id: ID,
    challenger: address,
    oracle: address,
}
```

**Indexer filter config (TOML):**

```toml
[network]
grpc_url = "https://fullnode.testnet.sui.io/"
network = "testnet"

[database]
url = "postgresql://postgres:password@localhost:5433/frontier_intel"

[events]
batch_size = 100
max_concurrent_batches = 8

# Filter for your protocol's package
[[events.filters]]
package = "0xYOUR_PROTOCOL_PACKAGE_ID"
module = "profile"
event_type = "ScoreUpdated"

[[events.filters]]
package = "0xYOUR_PROTOCOL_PACKAGE_ID"
module = "attestation"
event_type = "AttestationIssued"

[[events.filters]]
package = "0xYOUR_PROTOCOL_PACKAGE_ID"
module = "oracle_registry"
event_type = "FraudChallengeCreated"

[[events.filters]]
package = "0xYOUR_PROTOCOL_PACKAGE_ID"
module = "oracle_registry"
event_type = "FraudChallengeResolved"
```

**Rust ingestion code:**

```rust
use sui_indexer_core::{IndexerCore, IndexerConfig};
use sui_json_rpc_types::SuiEvent;
use async_trait::async_trait;
use eyre::Result;
use std::sync::Arc;

struct FrontierIntelProcessor {
    db_pool: sqlx::PgPool,
    redis: redis::aio::ConnectionManager,
}

#[async_trait]
impl EventProcessor for FrontierIntelProcessor {
    async fn process_event(&self, event: SuiEvent) -> Result<ProcessedEvent> {
        let event_type = event.type_.name.as_str();

        match event_type {
            "ScoreUpdated" => self.handle_score_updated(event).await?,
            "AttestationIssued" => self.handle_attestation_issued(event).await?,
            "FraudChallengeCreated" => self.handle_challenge_created(event).await?,
            "FraudChallengeResolved" => self.handle_challenge_resolved(event).await?,
            _ => {}
        }

        Ok(ProcessedEvent::from_sui_event(event))
    }
}

impl FrontierIntelProcessor {
    async fn handle_score_updated(&self, event: SuiEvent) -> Result<()> {
        let parsed = event.parsed_json;

        sqlx::query!(
            r#"
            INSERT INTO score_updates (profile_id, schema_id, old_value, new_value, issuer, epoch)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (profile_id, schema_id) DO UPDATE SET
                new_value = EXCLUDED.new_value,
                issuer = EXCLUDED.issuer,
                epoch = EXCLUDED.epoch,
                updated_at = NOW()
            "#,
            parsed["profile_id"].as_str(),
            parsed["schema_id"].as_str(),
            parsed["old_value"].as_u64(),
            parsed["new_value"].as_u64(),
            parsed["issuer"].as_str(),
            event.checkpoint_sequence_number as i64
        ).execute(&self.db_pool).await?;

        // Invalidate cache
        let cache_key = format!("score:{}:{}", parsed["profile_id"], parsed["schema_id"]);
        self.redis.del(&cache_key).await?;

        Ok(())
    }
}
```

### EVM Event Ingestion (MUD Tables)

CCP's MUD framework emits events for:
- Smart Gate connections
- Kill mails
- Character state changes
- Assembly deployments

**Ingestion via MUD indexer:**

```rust
use ethers::prelude::*;
use ethers::providers::{Provider, Ws};

struct MUDEventListener {
    provider: Provider<Ws>,
    world_contract: Address,
    db_pool: sqlx::PgPool,
}

impl MUDEventListener {
    async fn listen(&self) -> Result<()> {
        let filter = Filter::new()
            .address(self.world_contract)
            .event("KillMail(uint256,uint256,uint256,uint256)");

        let mut stream = self.provider.subscribe_logs(&filter).await?;

        while let Some(log) = stream.next().await {
            self.handle_kill_mail(log).await?;
        }

        Ok(())
    }

    async fn handle_kill_mail(&self, log: Log) -> Result<()> {
        let decoded = self.decode_kill_mail(log)?;

        sqlx::query!(
            r#"
            INSERT INTO kill_mails (kill_mail_id, killer_id, victim_id, system_id, timestamp, tx_hash)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (kill_mail_id) DO NOTHING
            "#,
            decoded.kill_mail_id,
            decoded.killer_id,
            decoded.victim_id,
            decoded.system_id,
            decoded.timestamp,
            format!("{:?}", log.transaction_hash.unwrap())
        ).execute(&self.db_pool).await?;

        Ok(())
    }
}
```

---

## PROCESSING LAYER: INTEL COMPUTATION

### Score Aggregation (Off-Chain)

Your oracles push aggregated scores on-chain (ScoreCache), but the indexer maintains the full history for analytics:

```rust
// Compute rolling averages, trends, anomaly detection
pub struct ScoreComputer {
    db_pool: sqlx::PgPool,
}

impl ScoreComputer {
    pub async fn compute_pirate_index(&self, character_id: &str) -> Result<u64> {
        let kills = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) FROM kill_mails 
            WHERE killer_id = $1 
            AND timestamp > NOW() - INTERVAL '30 days'
            "#,
            character_id
        ).fetch_one(&self.db_pool).await?;

        let losses = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) FROM kill_mails 
            WHERE victim_id = $1 
            AND timestamp > NOW() - INTERVAL '30 days'
            "#,
            character_id
        ).fetch_one(&self.db_pool).await?;

        let friendly_fire = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) FROM kill_mails km
            JOIN character_tribes ct1 ON km.killer_id = ct1.character_id
            JOIN character_tribes ct2 ON km.victim_id = ct2.character_id
            WHERE km.killer_id = $1 
            AND ct1.tribe_id = ct2.tribe_id
            AND km.timestamp > NOW() - INTERVAL '30 days'
            "#,
            character_id
        ).fetch_one(&self.db_pool).await?;

        // Pirate Index = (kills / (losses + 1)) * 100 - (friendly_fire * 50)
        let base = (kills as f64 / (losses as f64 + 1.0)) * 100.0;
        let penalty = friendly_fire as f64 * 50.0;
        let score = (base - penalty).max(0.0) as u64;

        Ok(score)
    }

    pub async fn compute_gate_heat(&self, system_id: &str) -> Result<u64> {
        // Weight recent kills higher
        let heat = sqlx::query_scalar!(
            r#"
            SELECT SUM(
                CASE 
                    WHEN timestamp > NOW() - INTERVAL '1 hour' THEN 100
                    WHEN timestamp > NOW() - INTERVAL '6 hours' THEN 50
                    WHEN timestamp > NOW() - INTERVAL '24 hours' THEN 20
                    ELSE 5
                END
            ) FROM kill_mails
            WHERE system_id = $1
            AND timestamp > NOW() - INTERVAL '7 days'
            "#,
            system_id
        ).fetch_one(&self.db_pool).await?;

        Ok(heat.unwrap_or(0) as u64)
    }
}
```

### Tribe Filter Engine

Same raw data, different views:

```rust
pub struct TribeFilter {
    tribe_id: String,
    standing_table: HashMap<String, i64>, // system_id -> standing
}

impl TribeFilter {
    pub fn filter_intel(&self, intel: Vec<SystemIntel>) -> Vec<SystemIntel> {
        intel.into_iter()
            .map(|mut i| {
                // Apply tribe standing
                if let Some(standing) = self.standing_table.get(&i.system_id) {
                    i.standing = *standing;
                    if *standing < -50 {
                        i.is_hostile = true;
                    }
                }
                i
            })
            .filter(|i| {
                // Filter out intel from enemy tribes
                if let Some(source_tribe) = &i.source_tribe {
                    self.standing_table.get(source_tribe).unwrap_or(&0) >= &-50
                } else {
                    true
                }
            })
            .collect()
    }
}
```

---

## STORAGE LAYER: SCHEMA

### PostgreSQL Tables

```sql
-- Raw events (immutable)
CREATE TABLE raw_events (
    id BIGSERIAL PRIMARY KEY,
    chain VARCHAR(10) NOT NULL, -- 'sui' or 'evm'
    event_type VARCHAR(100) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT,
    checkpoint BIGINT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_events_type ON raw_events(event_type);
CREATE INDEX idx_raw_events_tx ON raw_events(tx_hash);

-- Score cache (hot, frequently updated)
CREATE TABLE score_cache (
    profile_id VARCHAR(66) NOT NULL,
    schema_id VARCHAR(100) NOT NULL,
    value BIGINT NOT NULL,
    issuer VARCHAR(66) NOT NULL,
    attestation_count BIGINT NOT NULL DEFAULT 0,
    epoch BIGINT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (profile_id, schema_id)
);

CREATE INDEX idx_score_cache_schema ON score_cache(schema_id);

-- Kill mails (analytics)
CREATE TABLE kill_mails (
    kill_mail_id VARCHAR(66) PRIMARY KEY,
    killer_id VARCHAR(66) NOT NULL,
    victim_id VARCHAR(66) NOT NULL,
    system_id VARCHAR(66) NOT NULL,
    loss_type VARCHAR(50),
    foam_value BIGINT,
    timestamp TIMESTAMPTZ NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kill_mails_killer ON kill_mails(killer_id);
CREATE INDEX idx_kill_mails_victim ON kill_mails(victim_id);
CREATE INDEX idx_kill_mails_system ON kill_mails(system_id);
CREATE INDEX idx_kill_mails_time ON kill_mails(timestamp);

-- Gate intel (live)
CREATE TABLE gate_intel (
    system_id VARCHAR(66) NOT NULL,
    schema_id VARCHAR(100) NOT NULL,
    value BIGINT NOT NULL,
    issuer VARCHAR(66) NOT NULL,
    oracle_stake BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (system_id, schema_id)
);

CREATE INDEX idx_gate_intel_expires ON gate_intel(expires_at);

-- Route graph (static, refreshed on chain changes)
CREATE TABLE gate_connections (
    from_system VARCHAR(66) NOT NULL,
    to_system VARCHAR(66) NOT NULL,
    gate_id VARCHAR(66),
    owner_tribe VARCHAR(66),
    base_distance BIGINT,
    PRIMARY KEY (from_system, to_system)
);

-- Tribe standings
CREATE TABLE tribe_standings (
    syndicate_id VARCHAR(66) NOT NULL,
    tribe_id VARCHAR(66) NOT NULL,
    standing BIGINT NOT NULL,
    treaty_type SMALLINT NOT NULL, -- 0=war, 1=neutral, 2=NAP, 3=alliance
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (syndicate_id, tribe_id)
);

-- Analytics: system heat (materialized view, refreshed every 5 min)
CREATE MATERIALIZED VIEW system_heat AS
SELECT 
    system_id,
    COUNT(*) as kill_count_24h,
    COUNT(DISTINCT killer_id) as unique_killers,
    SUM(foam_value) as total_foam_destroyed,
    MAX(timestamp) as last_kill
FROM kill_mails
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY system_id;

CREATE INDEX idx_system_heat_kills ON system_heat(kill_count_24h DESC);
```

### Redis Cache Strategy

```
Key patterns:
- score:{profile_id}:{schema_id} -> latest score value (TTL: 5 min)
- gate:{system_id}:intel -> gate status blob (TTL: 10 min)
- route:{from}:{to}:{tribe_id} -> cached route (TTL: 1 min)
- heat:{system_id} -> heat score (TTL: 2 min)
- session:{player_id} -> tribe, syndicate, preferences (TTL: 24h)
```

---

## API LAYER: ENDPOINTS

### GraphQL Schema

```graphql
type Query {
  # Player reputation
  playerReputation(characterId: ID!): PlayerReputation

  # System intel
  systemIntel(systemId: ID!, tribeId: ID): SystemIntel

  # Route planning
  calculateRoute(
    from: ID!
    to: ID!
    tribeId: ID
    avoidHostile: Boolean
    maxHeatTrap: Int
  ): Route

  # Killboard
  killboard(
    timeRange: TimeRange
    tribeId: ID
    systemId: ID
    limit: Int = 50
  ): [KillMail!]!

  # Leaderboards
  leaderboard(
    type: LeaderboardType!
    timeRange: TimeRange
    limit: Int = 50
  ): [LeaderboardEntry!]!

  # Gate status
  gateStatus(systemId: ID!): GateStatus

  # Tribe dashboard
  tribeDashboard(tribeId: ID!): TribeDashboard
}

type Subscription {
  # Live intel stream
  liveIntel(systemIds: [ID!], tribeId: ID): IntelUpdate!

  # Kill feed
  killFeed(tribeId: ID, systemId: ID): KillMail!

  # Score changes
  scoreUpdate(characterId: ID): ScoreUpdate!
}

type PlayerReputation {
  characterId: ID!
  pirateIndex: Int
  creditScore: Int
  builderScore: Int
  governanceScore: Int
  tribeStanding: Int
}

type SystemIntel {
  systemId: ID!
  gateHostile: Boolean
  gateCamped: Boolean
  heatTrapScore: Int
  routeVerified: Boolean
  contestedBy: ID
  standing: Int
  recentKills: [KillMail!]!
}

type Route {
  path: [ID!]!
  totalDistance: Int
  estimatedRisk: RiskLevel
  gates: [GateInfo!]!
}

type GateInfo {
  systemId: ID!
  status: GateStatus
  toll: Int
  standing: Int
}
```

### REST Endpoints (for simple queries)

```
GET /api/v1/health
GET /api/v1/score/:characterId/:schemaId
GET /api/v1/intel/:systemId
GET /api/v1/killboard?timeRange=24h&tribeId=xxx
GET /api/v1/leaderboard/:type?timeRange=7d&limit=50
POST /api/v1/route/calculate
GET /api/v1/heatmap?bbox=x1,y1,x2,y2
```

### WebSocket Protocol

```json
// Client subscribes
{
  "action": "subscribe",
  "channel": "live_intel",
  "filters": {
    "systemIds": ["system_123", "system_456"],
    "tribeId": "tribe_abc"
  }
}

// Server pushes update
{
  "type": "intel_update",
  "systemId": "system_123",
  "updates": [
    {"schema": "GATE_CAMPED", "value": 1, "issuer": "0xabc...", "stake": 10000}
  ],
  "timestamp": "2026-04-25T10:04:00Z"
}
```

---

## PERFORMANCE TARGETS

| Metric | Target | EF-Map Comparison |
|--------|--------|-------------------|
| **Event ingestion latency** | < 2 seconds | EF-Map: batch cron, minutes [^29^] |
| **Score query latency** | < 50ms (cached) | EF-Map: KV read, ~100ms |
| **Route calculation** | < 200ms (A* on pre-built graph) | EF-Map: similar |
| **Killboard refresh** | Real-time (WebSocket push) | EF-Map: manual refresh |
| **Concurrent users** | 10,000+ | EF-Map: unknown |
| **Data retention** | Permanent (IPFS archive) | EF-Map: KV TTL [^29^] |

---

## DEPLOYMENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Indexer    │  │  Indexer    │  │  Indexer    │         │
│  │  (Sui)      │  │  (EVM)      │  │  (External) │         │
│  │  Replica 1  │  │  Replica 1  │  │  Replica 1  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  API        │  │  API        │  │  WebSocket  │         │
│  │  Server 1   │  │  Server 2   │  │  Server     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  PostgreSQL (Primary + Replica)                     │    │
│  │  Redis Cluster (6 nodes)                            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## COMPETITIVE ADVANTAGE VS EF-MAP

| Aspect | EF-Map | Your Indexer |
|--------|--------|--------------|
| **Ingestion** | Docker cron (batch) [^29^] | gRPC streaming (real-time) |
| **Latency** | Minutes | Sub-second |
| **Storage** | Postgres + Cloudflare KV [^29^] | Postgres + Redis + IPFS |
| **API** | REST only | GraphQL + REST + WebSocket |
| **Open source** | Closed | Open (attracts contributors) |
| **Composability** | None | Smart Assembly direct reads |
| **Tribe filtering** | None | Native per-syndicate views |
| **Data retention** | KV TTL expires [^29^] | Permanent IPFS archive |

---

## IMPLEMENTATION ORDER

| Week | Component | Deliverable |
|------|-----------|-------------|
| 1 | Sui indexer core | Fork longcipher/sui-indexer, configure for your package |
| 2 | EVM indexer | MUD event listener, kill mail ingestion |
| 3 | PostgreSQL schema | All tables, indexes, materialized views |
| 4 | Score computer | Pirate Index, Credit Score, Heat Trap algorithms |
| 5 | API layer | GraphQL schema, REST endpoints |
| 6 | WebSocket | Live intel streaming |
| 7 | Redis cache | Hot cache, session store |
| 8 | Load testing | 10k concurrent users, performance tuning |

---

*This indexer architecture is designed to make EF-Map's infrastructure look like a prototype. Real-time ingestion, permanent storage, tribe-native filtering, and Smart Assembly composability — all things EF-Map cannot build without a full rewrite.*
