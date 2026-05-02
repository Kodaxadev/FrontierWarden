# ---------- builder ----------
FROM rust:1.88-bookworm AS builder

WORKDIR /build

# Copy manifests first for dependency caching
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    echo "" > src/lib.rs && \
    cargo build --release --bin efrep-indexer && \
    rm -rf src target/release/deps/efrep_indexer* target/release/.fingerprint

# Copy full source and build for real
COPY . .
RUN cargo build --release --bin efrep-indexer

# ---------- runtime ----------
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libssl3 libpq-dev curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled binary
COPY --from=builder /build/target/release/efrep-indexer /app/efrep-indexer

# Copy migrations (run manually against DB before deploy)
COPY migrations /app/migrations

# Copy production config (all required fields present; env vars override)
COPY config.prod.toml /app/config.toml

# Signature verifier for non-Ed25519 wallets (zkLogin, passkey, etc.)
COPY scripts/verify-personal-message.mjs /app/scripts/verify-personal-message.mjs

# Install Node.js dependencies for the Mysten signature verifier
RUN cd /app && \
    printf '{"type":"module"}' > package.json && \
    npm install @mysten/sui@2.16.0 --save && \
    node -e "import('@mysten/sui/verify').then(() => console.log('OK')).catch(e => { console.error(e.message); process.exit(1) })"

ENV EFREP_SIGNATURE_VERIFIER=/app/scripts/verify-personal-message.mjs

# The binary reads config.toml from CWD (/app).
# All secrets are injected via Railway env vars which override TOML values.

EXPOSE 3000

CMD ["/app/efrep-indexer"]
