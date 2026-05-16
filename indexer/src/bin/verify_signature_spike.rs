// verify_signature_spike — dev-only harness for testing Sui GraphQL verifySignature.
//
// NOT wired into the production API. NOT deployed. NOT a session issuer.
// Remove or gate behind #[cfg(not(...))] when verifySignature integration
// lands in api_sessions.rs.
//
// What this tests:
//   - Exact request shape for Sui GraphQL verifySignature
//   - Whether the testnet endpoint is reachable and returns expected JSON
//   - Whether an Ed25519 self-test signature round-trips through the API
//   - (Manual) Whether an EVE Vault zkLogin signature is accepted by the testnet node
//
// Usage (mode 1 — self-test with generated Ed25519 key, no wallet needed):
//   cargo run --bin verify_signature_spike
//
// Usage (mode 2 — verify a real wallet signature):
//   SPIKE_ADDRESS=0x<addr> \
//   SPIKE_MESSAGE_TEXT="FrontierWarden operator session\nAddress: ..." \
//   SPIKE_SIGNATURE=<base64-sui-signature> \
//   cargo run --bin verify_signature_spike
//
// Optional:
//   EFREP_GRAPHQL_URL=https://graphql.testnet.sui.io/   (default)
//
// Notes on the message encoding for verifySignature:
//   The `message` GraphQL argument is the RAW message bytes, Base64-encoded.
//   The fullnode internally applies:
//     digest = Blake2b([0x03, 0x00, 0x00] || bcs_vector(message_bytes))
//   and verifies the signature against that digest.
//   Do NOT pre-apply BCS or intent bytes — the fullnode does this itself.

use base64::{engine::general_purpose, Engine as _};
use blake2::digest::{Update, VariableOutput};
use blake2::Blake2bVar;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};

const GRAPHQL_URL_DEFAULT: &str = "https://graphql.testnet.sui.io/";

// verifySignature: the current preferred field (verifyZkLoginSignature is deprecated).
// Supports Ed25519, Secp256k1, Secp256r1, MultiSig, zkLogin, and Passkey.
// Schema source: crates/sui-indexer-alt-graphql/schema.graphql (MystenLabs/sui main)
const VERIFY_QUERY: &str = r#"
  query VerifySignature(
    $message: Base64!
    $signature: Base64!
    $intentScope: IntentScope!
    $author: SuiAddress!
  ) {
    verifySignature(
      message: $message
      signature: $signature
      intentScope: $intentScope
      author: $author
    ) {
      success
    }
  }
"#;

// Schema introspection query — used to confirm field availability on the live node.
const INTROSPECT_QUERY: &str = r#"
  {
    __schema {
      queryType {
        fields(includeDeprecated: true) {
          name
          isDeprecated
          deprecationReason
        }
      }
    }
  }
"#;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let graphql_url = std::env::var("EFREP_GRAPHQL_URL")
        .unwrap_or_else(|_| GRAPHQL_URL_DEFAULT.to_owned());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    // Step 1: optional schema introspection to confirm verifySignature exists.
    if std::env::var("SPIKE_INTROSPECT").is_ok() {
        introspect_schema(&client, &graphql_url).await?;
        return Ok(());
    }

    // Step 2: determine mode.
    let (address, message_b64, signature_b64, mode) = match (
        std::env::var("SPIKE_ADDRESS").ok(),
        std::env::var("SPIKE_MESSAGE_TEXT").ok(),
        std::env::var("SPIKE_SIGNATURE").ok(),
    ) {
        (Some(addr), Some(msg), Some(sig)) => {
            let msg_b64 = general_purpose::STANDARD.encode(msg.as_bytes());
            (addr, msg_b64, sig, "provided")
        }
        _ => {
            eprintln!("No SPIKE_ADDRESS/MESSAGE_TEXT/SIGNATURE set.");
            eprintln!("Running self-test with a locally generated Ed25519 key.");
            eprintln!();
            let (addr, msg_b64, sig_b64) = generate_ed25519_fixture()?;
            (addr, msg_b64, sig_b64, "self-test-ed25519")
        }
    };

    let sig_bytes = general_purpose::STANDARD.decode(&signature_b64)?;
    let scheme_label = match sig_bytes.first() {
        Some(0x00) => "Ed25519 (0x00)",
        Some(0x01) => "Secp256k1 (0x01)",
        Some(0x02) => "Secp256r1 (0x02)",
        Some(0x03) => "MultiSig (0x03)",
        Some(0x05) => "zkLogin (0x05) — EVE Vault path",
        Some(0x06) => "Passkey (0x06)",
        Some(b) => return Err(anyhow::anyhow!("Unknown flag byte 0x{b:02x}")),
        None => return Err(anyhow::anyhow!("Empty signature bytes")),
    };

    println!("=== Sui GraphQL verifySignature Spike ===");
    println!("Mode:          {mode}");
    println!("Endpoint:      {graphql_url}");
    println!("Author:        {address}");
    println!("Scheme:        {scheme_label}");
    println!("Sig bytes len: {}", sig_bytes.len());
    println!(
        "Message(b64):  {}…",
        &message_b64[..message_b64.len().min(40)]
    );
    println!();

    // Step 3: build and send the verifySignature request.
    let variables = json!({
        "message":     message_b64,
        "signature":   signature_b64,
        "intentScope": "PERSONAL_MESSAGE",
        "author":      address,
    });

    let body = json!({
        "query":     VERIFY_QUERY,
        "variables": variables,
    });

    println!("--- GraphQL request body ---");
    println!("{}", serde_json::to_string_pretty(&body)?);
    println!();

    let resp = client
        .post(&graphql_url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    let http_status = resp.status();
    let body_text = resp.text().await?;

    println!("--- GraphQL response ---");
    println!("HTTP status: {http_status}");

    let parsed: Value = serde_json::from_str(&body_text).unwrap_or(Value::String(body_text.clone()));
    println!("{}", serde_json::to_string_pretty(&parsed)?);
    println!();

    // Step 4: interpret result.
    let success = parsed["data"]["verifySignature"]["success"].as_bool();
    let gql_errors = &parsed["errors"];

    println!("--- Interpretation ---");
    match success {
        Some(true) => {
            println!("✓  SIGNATURE VERIFIED");
            println!("   The Sui testnet node confirmed this signature is valid.");
            if mode == "self-test-ed25519" {
                println!("   This confirms the endpoint, request shape, and Ed25519 round-trip.");
                println!("   Re-run with SPIKE_ADDRESS/MESSAGE_TEXT/SIGNATURE to test EVE Vault.");
            }
        }
        Some(false) => {
            println!("✗  SIGNATURE INVALID (success=false)");
            println!("   The node rejected the signature. Check address derivation,");
            println!("   message encoding, or signature scheme compatibility.");
        }
        None => {
            if !gql_errors.is_null() {
                println!("✗  GRAPHQL ERRORS");
                println!("   {gql_errors}");
                println!();
                println!("   Possible causes for zkLogin (0x05) signatures:");
                println!("   - EVE Vault FusionAuth issuer not in testnet allowlist");
                println!("   - Proof epoch has expired");
                println!("   - Message encoding mismatch (BCS vs raw bytes)");
                println!("   - verifySignature field not yet available on this node version");
                println!();
                println!("   Record the exact error text in ZKLOGIN_SESSION_AUTH_RESEARCH.md.");
            } else {
                println!("?  UNKNOWN — no success field and no errors.");
                println!("   Raw response: {body_text}");
            }
        }
    }

    Ok(())
}

// Introspect the live schema and print verify/sign-related fields.
async fn introspect_schema(client: &reqwest::Client, graphql_url: &str) -> anyhow::Result<()> {
    println!("=== Schema introspection ===");
    let body = json!({ "query": INTROSPECT_QUERY });
    let resp = client
        .post(graphql_url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    let parsed: Value = resp.json().await?;
    let fields = parsed["data"]["__schema"]["queryType"]["fields"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    println!("Query root fields matching 'verify', 'sign', or 'zk':");
    for field in &fields {
        let name = field["name"].as_str().unwrap_or("");
        let deprecated = field["isDeprecated"].as_bool().unwrap_or(false);
        if name.contains("verify") || name.contains("sign") || name.contains("zk") {
            if deprecated {
                let reason = field["deprecationReason"].as_str().unwrap_or("");
                println!("  {name}  [DEPRECATED: {reason}]");
            } else {
                println!("  {name}");
            }
        }
    }
    Ok(())
}

// Generates a fresh Ed25519 key pair, signs the standard session message with it,
// and returns (sui_address, message_b64, signature_b64).
//
// The signing path matches exactly what api_sessions.rs's verify_personal_message_ed25519
// expects, and what the Sui fullnode computes internally for verifySignature:
//   digest = Blake2b([0x03, 0x00, 0x00] || uleb128(len) || message_bytes)
//   signature_bytes = [0x00] || ed25519_sig(64) || pubkey(32)
fn generate_ed25519_fixture() -> anyhow::Result<(String, String, String)> {
    let signing_key = SigningKey::generate(&mut rand::rngs::OsRng);
    let pubkey = signing_key.verifying_key().to_bytes();

    // Sui address for Ed25519: Blake2b(0x00 || pubkey)
    let mut addr_input = vec![0u8];
    addr_input.extend_from_slice(&pubkey);
    let address = format!("0x{}", hex::encode(blake2b_32(&addr_input)?));

    // Session message (same format as api_sessions.rs)
    let nonce = "selftest00000000";
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        + 3600;
    let message = format!(
        "FrontierWarden operator session\nAddress: {address}\nNonce: {nonce}\nExpires: {expires_at}"
    );

    println!("Self-test message:");
    println!("{message}");
    println!();

    // Digest: Blake2b([0x03, 0x00, 0x00] || bcs_vector(message_bytes))
    let message_bytes = message.as_bytes();
    let mut intent_msg = vec![0x03u8, 0x00, 0x00];
    intent_msg.extend_from_slice(&bcs_vector(message_bytes));
    let digest = blake2b_32(&intent_msg)?;

    // Sign the digest with the ephemeral Ed25519 key
    let sig = signing_key.sign(&digest);

    // Serialize: [0x00] || sig(64) || pubkey(32)
    let mut serialized = vec![0x00u8];
    serialized.extend_from_slice(&sig.to_bytes());
    serialized.extend_from_slice(&pubkey);

    // message_b64 = raw bytes (NOT BCS-wrapped — the fullnode wraps internally)
    let message_b64 = general_purpose::STANDARD.encode(message_bytes);
    let sig_b64 = general_purpose::STANDARD.encode(&serialized);

    Ok((address, message_b64, sig_b64))
}

fn blake2b_32(input: &[u8]) -> anyhow::Result<[u8; 32]> {
    let mut out = [0u8; 32];
    let mut hasher = Blake2bVar::new(32)?;
    hasher.update(input);
    hasher.finalize_variable(&mut out)?;
    Ok(out)
}

fn bcs_vector(value: &[u8]) -> Vec<u8> {
    let mut out = uleb128(value.len() as u64);
    out.extend_from_slice(value);
    out
}

fn uleb128(mut value: u64) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            return out;
        }
    }
}
