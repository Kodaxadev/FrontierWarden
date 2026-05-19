// event_source_parity.rs — Dev-only parity comparison: JSON-RPC vs GraphQL.
// Not deployed. Run locally:   RUST_LOG=info cargo run --bin event_source_parity
// Results → Documents/GRAPHQL_EVENT_SOURCE_PARITY_SMOKE.md

use anyhow::Result;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};

use efrep_indexer::event_source::SuiEventSource;
use efrep_indexer::graphql_event_client::GraphqlEventClient;
use efrep_indexer::rpc::{EventPage, RpcClient, SuiEvent};

const RPC_URL: &str = "https://fullnode.testnet.sui.io:443";
const GQL_URL: &str = "https://graphql.testnet.sui.io/graphql";
const FW_PKG: &str =
    "0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa";
const MODULES: &[&str] = &[
    "reputation_gate", "attestation", "schema_registry",
    "profile", "vouch", "fraud_challenge",
];
const BOOTSTRAP_CHECKPOINT: u64 = 337848469;

#[tokio::main]
async fn main() -> Result<()> {
    fmt().with_env_filter(
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
    ).init();

    info!("=== Event Source Parity Smoke ===");
    info!(rpc = RPC_URL, gql = GQL_URL, pkg = FW_PKG);

    let rpc = RpcClient::new(RPC_URL);
    let gql = GraphqlEventClient::new(GQL_URL);
    let (mut total_rpc, mut total_gql, mut total_mm) = (0usize, 0usize, 0usize);

    // ── MoveModule filters ───────────────────────────────────────────────
    for &module in MODULES {
        info!(module, "--- MoveModule filter ---");
        let rp = rpc.query_events(FW_PKG, module, None, 50).await;
        let gp = gql.query_events(FW_PKG, module, None, 50).await;
        let (r, g, m) = compare_pages(module, &rp, &gp);
        total_rpc += r; total_gql += g; total_mm += m;

        // Page 2 if available
        if let (Ok(ref rpage), Ok(ref gpage)) = (&rp, &gp) {
            if rpage.has_next_page {
                if let (Some(rc), Some(gc)) = (&rpage.next_cursor, &gpage.next_cursor) {
                    info!(module, "--- page 2 ---");
                    let rp2 = rpc.query_events(FW_PKG, module, Some(rc), 50).await;
                    let gp2 = gql.query_events(FW_PKG, module, Some(gc), 50).await;
                    let (r, g, m) = compare_pages(&format!("{module}:p2"), &rp2, &gp2);
                    total_rpc += r; total_gql += g; total_mm += m;
                }
            }
        }
    }

    // ── MoveEventType filter ─────────────────────────────────────────────
    let ptype = format!("{FW_PKG}::reputation_gate::PassageGranted");
    info!(event_type = %ptype, "--- MoveEventType filter ---");
    let rp = rpc.query_events_by_type(&ptype, None, 50).await;
    let gp = gql.query_events_by_type(&ptype, None, 50).await;
    let (r, g, m) = compare_pages("PassageGranted", &rp, &gp);
    total_rpc += r; total_gql += g; total_mm += m;

    // ── afterCheckpoint bootstrap ────────────────────────────────────────
    info!("--- afterCheckpoint bootstrap (checkpoint {BOOTSTRAP_CHECKPOINT}) ---");
    let gql_boot = gql_after_checkpoint(GQL_URL, FW_PKG, "reputation_gate", BOOTSTRAP_CHECKPOINT, 10).await;
    match &gql_boot {
        Ok(page) => {
            let first = page.data.first().and_then(|e| e.checkpoint.as_deref());
            let last = page.data.last().and_then(|e| e.checkpoint.as_deref());
            info!(count = page.data.len(), first = first.unwrap_or("-"), last = last.unwrap_or("-"), "bootstrap page");
            for ev in &page.data {
                if let Some(cp) = ev.checkpoint.as_deref().and_then(|s| s.parse::<u64>().ok()) {
                    if cp <= BOOTSTRAP_CHECKPOINT {
                        error!(tx = %ev.id.tx_digest, cp, "EVENT BEFORE BOOTSTRAP");
                        total_mm += 1;
                    }
                }
            }
        }
        Err(e) => { error!("afterCheckpoint failed: {e:#}"); total_mm += 1; }
    }

    // ── Dedup within page ────────────────────────────────────────────────
    info!("--- dedup check ---");
    if let Ok(ref page) = gql.query_events(FW_PKG, "reputation_gate", None, 50).await {
        let mut seen = std::collections::HashSet::new();
        let dups = page.data.iter().filter(|e| {
            !seen.insert(format!("{}:{}", e.id.tx_digest, e.id.event_seq))
        }).count();
        info!(events = page.data.len(), duplicates = dups, "dedup");
        total_mm += dups;
    }

    // ── Summary ──────────────────────────────────────────────────────────
    info!("=== SUMMARY ===");
    info!(rpc_events = total_rpc, gql_events = total_gql, mismatches = total_mm);
    if total_mm == 0 {
        info!("RESULT: PARITY CONFIRMED");
    } else {
        warn!(total_mm, "RESULT: MISMATCHES FOUND");
    }
    Ok(())
}

/// Direct GraphQL query with afterCheckpoint filter (not on SuiEventSource trait).
async fn gql_after_checkpoint(
    url: &str, pkg: &str, module: &str, after: u64, limit: u32,
) -> Result<EventPage> {
    let module_str = format!("{pkg}::{module}");
    let body = serde_json::json!({
        "query": "query($f:EventFilter!,$l:Int){events(filter:$f,first:$l){nodes{sequenceNumber timestamp sender{address}contents{json type{repr}}transactionModule{package{address}name}transaction{digest effects{checkpoint{sequenceNumber}}}}pageInfo{hasNextPage endCursor}}}",
        "variables": { "f": { "module": module_str, "afterCheckpoint": after }, "l": limit }
    });
    let resp: serde_json::Value = reqwest::Client::new()
        .post(url).json(&body).send().await?.json().await?;
    if let Some(e) = resp.get("errors") { anyhow::bail!("GQL: {e}"); }
    let nodes = resp["data"]["events"]["nodes"].as_array().map(|a| a.as_slice()).unwrap_or(&[]);
    let data: Vec<SuiEvent> = nodes.iter().filter_map(|n| {
        Some(SuiEvent {
            id: efrep_indexer::rpc::EventId {
                tx_digest: n["transaction"]["digest"].as_str()?.to_owned(),
                event_seq: n["sequenceNumber"].as_u64().unwrap_or(0).to_string(),
            },
            package_id: n["transactionModule"]["package"]["address"].as_str().unwrap_or("").to_owned(),
            transaction_module: n["transactionModule"]["name"].as_str().unwrap_or("").to_owned(),
            sender: n["sender"]["address"].as_str().map(|s| s.to_owned()),
            type_: n["contents"]["type"]["repr"].as_str().unwrap_or("").to_owned(),
            parsed_json: n["contents"]["json"].clone(),
            timestamp_ms: n["timestamp"].as_str().and_then(|iso|
                chrono::DateTime::parse_from_rfc3339(iso).ok().map(|dt| dt.timestamp_millis().to_string())),
            checkpoint: n["transaction"]["effects"]["checkpoint"]["sequenceNumber"]
                .as_u64().map(|c| c.to_string()),
        })
    }).collect();
    let pi = &resp["data"]["events"]["pageInfo"];
    Ok(EventPage {
        data, has_next_page: pi["hasNextPage"].as_bool().unwrap_or(false),
        next_cursor: pi["endCursor"].as_str().map(|c| efrep_indexer::rpc::EventId {
            tx_digest: c.to_owned(), event_seq: "gql".to_owned(),
        }),
    })
}

fn compare_pages(label: &str, rpc: &Result<EventPage>, gql: &Result<EventPage>) -> (usize, usize, usize) {
    let rp = match rpc { Ok(p) => p, Err(e) => { error!(label, "RPC fail: {e:#}"); return (0, 0, 1); } };
    let gp = match gql { Ok(p) => p, Err(e) => { error!(label, "GQL fail: {e:#}"); return (rp.data.len(), 0, 1); } };
    let (rc, gc) = (rp.data.len(), gp.data.len());
    let rfirst = rp.data.first().and_then(|e| e.checkpoint.as_deref());
    let rlast = rp.data.last().and_then(|e| e.checkpoint.as_deref());
    let gfirst = gp.data.first().and_then(|e| e.checkpoint.as_deref());
    let glast = gp.data.last().and_then(|e| e.checkpoint.as_deref());
    info!(label, rc, gc,
        rpc_cp = format!("{}..{}", rfirst.unwrap_or("-"), rlast.unwrap_or("-")),
        gql_cp = format!("{}..{}", gfirst.unwrap_or("-"), glast.unwrap_or("-")),
        "page");
    if rc != gc { warn!(label, rc, gc, "COUNT MISMATCH"); }
    let mut mm = 0usize;
    for i in 0..rc.min(gc) {
        let (r, g) = (&rp.data[i], &gp.data[i]);
        let mut ok = true;
        if r.id.tx_digest != g.id.tx_digest { warn!(label, i, r=%r.id.tx_digest, g=%g.id.tx_digest, "tx_digest"); ok=false; }
        if r.id.event_seq != g.id.event_seq { warn!(label, i, r=%r.id.event_seq, g=%g.id.event_seq, "event_seq"); ok=false; }
        if r.type_ != g.type_ { warn!(label, i, r=%r.type_, g=%g.type_, "type"); ok=false; }
        if r.sender != g.sender { warn!(label, i, r=?r.sender, g=?g.sender, "sender"); ok=false; }
        if r.checkpoint != g.checkpoint { warn!(label, i, r=?r.checkpoint, g=?g.checkpoint, "checkpoint"); ok=false; }
        let rk = json_keys(&r.parsed_json); let gk = json_keys(&g.parsed_json);
        if rk != gk { warn!(label, i, r=?rk, g=?gk, "parsedJson keys"); ok=false; }
        if !ok { mm += 1; }
    }
    if mm == 0 && rc == gc { info!(label, count = rc, "✓ PARITY"); }
    (rc, gc, mm)
}

fn json_keys(v: &serde_json::Value) -> Vec<String> {
    let mut k: Vec<String> = v.as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default();
    k.sort(); k
}
