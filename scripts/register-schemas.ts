/**
 * register-schemas.ts — Register the EVE Frontier schema set on a deployed
 * SchemaRegistry shared object. Single PTB, atomic.
 *
 * Usage:
 *   npx tsx scripts/register-schemas.ts
 *
 * Optional:
 *   DEPLOYER_KEY=suiprivkey1...      override local Sui keystore
 *   SUI_PRIVATE_KEY=suiprivkey1...   legacy key override
 *   SUI_RPC_URL=...                  override default fullnode from testnet-addresses.json
 *   GAS_BUDGET=100000000             override gas budget (MIST)
 *   DRY_RUN=1                        build + simulate without submitting
 *
 * The signer must be the SchemaRegistry admin (the address that ran the
 * original `sui client publish`). Non-admin senders abort with ENotAuthorized.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Transaction } from '@mysten/sui/transactions';
import { execute, loadKeypair, makeClient } from './lib/seed-wallet.js';

interface SchemaSpec {
  id: string;            // schema_id as ASCII (encoded to vector<u8>)
  version: number;       // u64
  revocable: boolean;
}

// EVE Frontier schema set per tribal_intelligence_layer.md §1.
// Equivalent to the spec's `register_gate_schemas()` Move function, lifted
// into a TS PTB so it can run against an already-deployed package.
//
// SHIP_KILL is non-revocable — kill records are permanent history. Everything
// else is revocable so oracles can retract or supersede stale intel.
const SCHEMAS: SchemaSpec[] = [
  // Gate status
  { id: 'GATE_HOSTILE',     version: 1, revocable: true  },
  { id: 'GATE_CAMPED',      version: 1, revocable: true  },
  { id: 'GATE_CLEAR',       version: 1, revocable: true  },
  { id: 'GATE_TOLL',        version: 1, revocable: true  },
  // Route intel
  { id: 'HEAT_TRAP',        version: 1, revocable: true  },
  { id: 'ROUTE_VERIFIED',   version: 1, revocable: true  },
  { id: 'SYSTEM_CONTESTED', version: 1, revocable: true  },
  // Combat + economy
  { id: 'SHIP_KILL',        version: 1, revocable: false },
  { id: 'PLAYER_BOUNTY',    version: 1, revocable: true  },
];

function loadAddresses() {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, 'testnet-addresses.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return {
    network: raw.network as 'testnet' | 'mainnet' | 'localnet',
    package: raw.package.id as string,
    schemaRegistry: raw.shared_objects.schema_registry.id as string,
    schemaRegistryInitialVersion: raw.shared_objects.schema_registry.initial_version as number,
  };
}

async function main() {
  const { network, package: pkg, schemaRegistry } = loadAddresses();
  const keypair = loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();

  console.log('[register-schemas]');
  console.log('  package         :', pkg);
  console.log('  schema_registry :', schemaRegistry);
  console.log('  network         :', network);
  console.log('  sender          :', sender);
  console.log('  schemas         :', SCHEMAS.map(s => s.id).join(', '));

  const client = makeClient();
  const tx = new Transaction();
  tx.setSender(sender);

  for (const s of SCHEMAS) {
    tx.moveCall({
      target: `${pkg}::schema_registry::register_schema`,
      arguments: [
        tx.object(schemaRegistry),
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(s.id))),
        tx.pure.u64(s.version),
        tx.pure.option('address', null),
        tx.pure.bool(s.revocable),
      ],
    });
  }

  await execute(client, keypair, tx, 'REGISTER-SCHEMAS');
  console.log('[submit] registered:', SCHEMAS.map(s => s.id));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
