use base64::{engine::general_purpose, Engine as _};
use blake2::digest::{Update, VariableOutput};
use blake2::Blake2bVar;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::RngCore;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn verify_personal_message_ed25519(
    message: &str,
    signature: &str,
    address: &str,
) -> anyhow::Result<()> {
    let bytes = general_purpose::STANDARD.decode(signature)?;
    anyhow::ensure!(bytes.len() == 97, "expected Ed25519 Sui signature");
    anyhow::ensure!(bytes[0] == 0, "unsupported Sui signature scheme");

    let sig = Signature::from_slice(&bytes[1..65])?;
    let pubkey: [u8; 32] = bytes[65..97].try_into()?;
    let verifying_key = VerifyingKey::from_bytes(&pubkey)?;
    anyhow::ensure!(sui_address(0, &pubkey) == address, "address mismatch");

    let digest = personal_message_digest(message.as_bytes())?;
    verifying_key.verify(&digest, &sig)?;
    Ok(())
}

pub(crate) fn personal_message_digest(message: &[u8]) -> anyhow::Result<[u8; 32]> {
    let bcs_message = bcs_vector(message);
    let mut intent_message = Vec::with_capacity(3 + bcs_message.len());
    intent_message.extend_from_slice(&[3, 0, 0]);
    intent_message.extend_from_slice(&bcs_message);

    let mut out = [0u8; 32];
    let mut hasher = Blake2bVar::new(32)?;
    hasher.update(&intent_message);
    hasher.finalize_variable(&mut out)?;
    Ok(out)
}

pub(crate) fn sui_address(flag: u8, pubkey: &[u8]) -> String {
    let mut bytes = Vec::with_capacity(1 + pubkey.len());
    bytes.push(flag);
    bytes.extend_from_slice(pubkey);

    let mut out = [0u8; 32];
    let mut hasher = Blake2bVar::new(32).expect("valid output length");
    hasher.update(&bytes);
    hasher.finalize_variable(&mut out).expect("fixed length");
    format!("0x{}", hex::encode(out))
}

pub(crate) fn bcs_vector(value: &[u8]) -> Vec<u8> {
    let mut out = uleb128(value.len() as u64);
    out.extend_from_slice(value);
    out
}

pub(crate) fn uleb128(mut value: u64) -> Vec<u8> {
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

pub(crate) fn normalize_sui_address(address: &str) -> Option<String> {
    let trimmed = address.trim();
    let hex = trimmed.strip_prefix("0x")?;
    (hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit()))
        .then(|| format!("0x{}", hex.to_ascii_lowercase()))
}

pub(crate) fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

pub(crate) fn signature_scheme_label(signature: &str) -> &'static str {
    let Ok(bytes) = general_purpose::STANDARD.decode(signature) else {
        return "invalid-base64";
    };
    match bytes.first().copied() {
        Some(0) => "ed25519",
        Some(1) => "secp256k1",
        Some(2) => "secp256r1",
        Some(3) => "multisig",
        Some(5) => "zklogin",
        Some(6) => "passkey",
        Some(_) => "unknown",
        None => "empty",
    }
}

pub(crate) fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
