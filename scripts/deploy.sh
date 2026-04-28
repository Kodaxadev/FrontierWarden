#!/bin/bash
# ============================================================
# deploy.sh — EVE Frontier Reputation System
# Publishes the reputation package to Sui devnet.
# (Devnet was chosen over testnet due to Windows-side testnet faucet issues.)
# ============================================================
#
# Prerequisites:
#   1. Install Sui CLI.
#   2. Derive or import a devnet-funded keystore key:
#      sui keytool new
#   3. Request devnet SUI from the faucet (https://faucet.devnet.sui.io/gas)
#
# Usage:
#   ./scripts/deploy.sh <KEYSTORE_PATH> <GAS_BUDGET>
#
# Example:
#   ./scripts/deploy.sh ~/.sui/sui_config/sui.keystore 50000
#
# After deployment:
#   1. Copy the published package address from the output
#   2. Update Move.toml: reputation = "<PUBLISHED_ADDRESS>"
#   3. Update the addresses in scripts/devnet-addresses.json
#   4. Run integration tests: npm run test:integration
# ============================================================

set -e

KEYSTORE_PATH="${1:?Usage: ./scripts/deploy.sh <KEYSTORE_PATH> <GAS_BUDGET>}"
GAS_BUDGET="${2:-50000}"
NETWORK="devnet"

echo "============================================"
echo " EVE Frontier — Reputation System Deploy"
echo "============================================"
echo " Network : $NETWORK"
echo " Key file: $KEYSTORE_PATH"
echo " Gas     : $GAS_BUDGET"
echo ""

# Validate keystore exists
if [ ! -f "$KEYSTORE_PATH" ]; then
  echo "ERROR: Keystore not found at $KEYSTORE_PATH"
  exit 1
fi

# Get active address from keystore
ACTIVE_ADDRESS=$(sui client active-address 2>/dev/null)
if [ -z "$ACTIVE_ADDRESS" ]; then
  echo "ERROR: No active Sui address. Run 'sui client new-address' first."
  exit 1
fi
echo " Deployer : $ACTIVE_ADDRESS"

# Dry-run first to catch any compile errors
echo ""
echo "[1/2] Compiling package..."
sui move build --build-env testnet

echo ""
echo "[2/2] Publishing to $NETWORK..."
PUBLISH_OUTPUT=$(sui client publish \
  --json \
  --build-env testnet \
  --gas-budget "$GAS_BUDGET" \
  "$KEYSTORE_PATH" \
  2>&1)

echo "$PUBLISH_OUTPUT"

# Extract published package address
PACKAGE_ADDRESS=$(echo "$PUBLISH_OUTPUT" | grep -oP '"objectId":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PACKAGE_ADDRESS" ]; then
  echo ""
  echo "ERROR: Could not extract package address from publish output."
  echo "Check the output above for errors."
  exit 1
fi

echo ""
echo "============================================"
echo " DEPLOY SUCCESSFUL"
echo "============================================"
echo " Package address : $PACKAGE_ADDRESS"
echo ""
echo "Next steps:"
echo "  1. Update Move.toml:"
echo "     reputation = \"$PACKAGE_ADDRESS\""
echo ""
echo "  2. Run: npm run test:integration"
echo "============================================"
