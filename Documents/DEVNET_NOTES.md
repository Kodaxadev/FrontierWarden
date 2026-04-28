# EFRep — Devnet Operations Notes

Devnet resets wipe all state without notice. This file tracks the information
you'll need after each reset so you're not re-discovering the same fixes.

---

## Current Package State

| Field              | Value                        |
|--------------------|------------------------------|
| Package ID         | `0x11a3f8dd19c2e55c29a3bb3faa2db5451e2c55fc0e83bcff86ed4726adb47e37` |
| Published at       | `2026-04-25 13:45 UTC`        |
| Devnet epoch       | `77` (at publish time)        |
| Active client env  | `devnet`                     |
| Move build env     | `testnet`                    |
| Sui CLI version    | `(check with: sui --version)` |
| Move edition       | `2024.beta`                   |

---

## Windows CLI Workarounds

### Path translation
Sui CLI on Windows does NOT accept Windows-style paths (`C:\...`).
Run all `sui` commands from **WSL2** or convert paths manually.

WSL2 path mapping:
```
C:\Users\<user>\...  →  /mnt/c/Users/<user>/...
```

Recommended: keep a WSL2 terminal pinned and `cd` to the repo via the mount:
```bash
cd /mnt/c/Users/Justi/Downloads/Alpha/EFRep
```

### PowerShell escaping
If running `sui` from PowerShell, arguments with `--` may need quoting:
```powershell
sui client publish --gas-budget 100000000
# If that errors, try:
sui client publish '--gas-budget' '100000000'
```

### File deletion / shell operations
`find -delete` fails on Windows-mounted paths in WSL2 due to permission mapping.
Use PowerShell for file operations on Windows paths:
```powershell
Remove-Item -Force -Path "C:\path\to\file"
Remove-Item -Recurse -Force -Path "C:\path\to\dir"
```

---

## Publish Command (run from WSL2)

```bash
cd /mnt/c/Users/Justi/Downloads/Alpha/EFRep
sui client switch --env devnet
sui client publish --build-env testnet --gas-budget 200000000
```

After a successful publish, capture the `PackageID` from the output and update
the **Current Package State** table above.

---

## Reset History

| Date (UTC)     | Reason            | Old Package ID                       | Notes                      |
|----------------|-------------------|--------------------------------------|----------------------------|
| 2026-04-25 | initial publish | —                                    | set baseline; package ID `0x11a3...adb47e37` live, 9 schemas registered |

Add a row each time the package is re-published after a devnet reset or upgrade.

---

## Common Commands

```bash
# Check active environment
sui client active-env

# Switch to devnet
sui client switch --env devnet

# Check active address and balance
sui client active-address
sui client balance

# Run all tests before publish
sui move test --build-env testnet

# Publish
sui client publish --build-env testnet --gas-budget 200000000

# Query a shared object (substitute real ID)
sui client object <OBJECT_ID>

# Call an entry function
sui client call \
  --package <PACKAGE_ID> \
  --module oracle_registry \
  --function register_oracle \
  --gas-budget 10000000 \
  --args ...
```

---

## Known Issues

- **Build env naming**: The active Sui client env is `devnet`, but Move
  framework dependencies currently resolve with `--build-env testnet`. Plain
  `sui move test` is expected to fail with a dependency environment error.
- **Windows path errors**: Always use WSL2 for CLI operations (see above).
- **Devnet epoch resets to 0**: FraudChallenge deadlines use `tx_context::epoch`.
  After a reset, epoch-dependent tests pass cleanly but devnet timeline restarts.
- **undelegate() not yet deployed**: Designed but gated behind green publish.
  See `sources/oracle_registry.move` comment stub for full implementation spec.
- **oracle_profile_tests.move**: 281 lines — healthy.
  `vouch_lending_tests.move` was split into `vouch_tests.move` + `lending_tests.move`.
  The old file is now retired; do not add tests to `vouch_lending_tests.move`.

---

## ACTION REQUIRED Before December 2027

`indexer/migrations/0003_efrep_partitions.sql` covers partitions through 2027-12.
Either extend with another year of monthly partitions or install `pg_partman`:
https://github.com/pgpartman/pg_partman
