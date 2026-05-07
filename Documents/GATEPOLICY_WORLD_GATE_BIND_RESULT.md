# GatePolicy World Gate Bind Result

Date: 2026-05-07
Environment: Sui testnet / Stillness

## Result

FrontierWarden successfully executed the first live
`GatePolicy -> world_gate_id` binding transaction.

Current product truth:

```text
GatePolicy status: BOUND
World Gate candidates: indexed
FW extension evidence: absent
Verified binding: false
```

This is intentionally not `BINDING VERIFIED`. Extension authorization remains a
separate proof signal:

```text
GatePolicy binding proves:
GatePolicy -> world_gate_id

Extension authorization proves:
world_gate_id -> extension TypeName

Verified requires both.
```

## Binding Transaction

- Bind tx digest: `BzYVxe3z4x1fXZNnrkPXdHn7HwTsShgwqrUqKPk7o3TC`
- Bound checkpoint: `334098874`
- GatePolicy ID: `0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807`
- GateAdminCap ID: `0x7876d36be78743903085fb0e32e56fa82424fbc6f0ee4997e9a237a14b2253a3`
- World Gate ID: `0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c`

The selected world gate is indexed as:

- Status: `online`
- Linked gate: `0xb2a07bad90170dfc123d20b9855b8b94b2673665f331102e9f8ccdcbb1549ea9`
- FrontierWarden extension active: `false`

## Binding Status API

`/gates/0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807/binding-status`
returns:

```json
{
  "bindingStatus": "bound",
  "worldGateId": "0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c",
  "worldGateStatus": "online",
  "linkedGateId": "0xb2a07bad90170dfc123d20b9855b8b94b2673665f331102e9f8ccdcbb1549ea9",
  "fwExtensionActive": false,
  "active": true,
  "boundTxDigest": "BzYVxe3z4x1fXZNnrkPXdHn7HwTsShgwqrUqKPk7o3TC",
  "boundCheckpoint": 334098874
}
```

## Trust API Check

`gate_access` against the active GatePolicy still returns `ALLOW_FREE` for the
EVE Vault operator wallet with `TRIBE_STANDING = 750`.

Observed proof warnings:

```text
PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:81551
```

This warning is expected after newer binding/passage events because the
gate-access proof is still anchored to config and attestation evidence.

## Wallet Note

During live operation, zk proof fetch failed once and a retry succeeded. The
existing wallet diagnostics remain the correct way to classify any recurrence.

## What This Proves

- GateAdminCap discovery works.
- `bind_world_gate` transaction construction works.
- EVE Vault signing can complete for this flow.
- Move binding function executes.
- `GatePolicyBoundToWorldGate` is emitted.
- Indexer processes the binding event.
- Binding-status API advances from `unbound` to `bound`.
- UI polling/index confirmation works.

## Not Yet Proven

- World Gate extension authorization.
- FrontierWarden extension installation on the world Gate.
- `BINDING VERIFIED`.
- Gate enforcement through the world extension.
