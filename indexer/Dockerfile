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
    apt-get install -y --no-install-recommends ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled binary
COPY --from=builder /build/target/release/efrep-indexer /app/efrep-indexer

# Copy migrations (run manually against DB before deploy)
COPY migrations /app/migrations

# Copy example config as a minimal production config template
COPY config.example.toml /app/config.toml

# The binary reads config.toml from CWD (/app).
# All secrets are injected via Railway env vars which override TOML values.

EXPOSE 3000

CMD ["/app/efrep-indexer"]
