/**
 * register-schemas.ts — Register the EVE Frontier schema set on a deployed
 * SchemaRegistry shared object. Single PTB, atomic.
 *
 * Usage:
 *   SUI_PRIVATE_KEY=suiprivkey1... npx tsx scripts/register-schemas.ts
 *
 * Optional:
 *   SUI_RPC_URL=...                  override default testnet fullnode
 *   GAS_BUDGET=100000000             override gas budget (MIST)
 *   DRY_RUN=1                        build + simulate without submitting
 *
 * The signer must be the SchemaRegistry admin (the address that ran the
 * original `sui client publish`). Non-admin senders abort with ENotAuthorized.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

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
    package: raw.package.id as string,
    schemaRegistry: raw.shared_objects.schema_registry.id as string,
    schemaRegistryInitialVersion: raw.shared_objects.schema_registry.initial_version as number,
  };
}

function loadKeypair(): Ed25519Keypair {
  const secret = process.env.SUI_PRIVATE_KEY;
  if (!secret) {
    throw new Error('SUI_PRIVATE_KEY not set. Export the admin key in suiprivkey1... format.');
  }
  const { schema, secretKey } = decodeSuiPrivateKey(secret);
  if (schema !== 'ED25519') {
    throw new Error(`Unsupported key schema: ${schema}. SchemaRegistry admin must be Ed25519.`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

async function main() {
  const { package: pkg, schemaRegistry } = loadAddresses();
  const keypair = loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();
  const rpc = process.env.SUI_RPC_URL ?? getFullnodeUrl('testnet');
  const gasBudget = BigInt(process.env.GAS_BUDGET ?? '100000000');
  const dryRun = process.env.DRY_RUN === '1';

  console.log('[register-schemas]');
  console.log('  package         :', pkg);
  console.log('  schema_registry :', schemaRegistry);
  console.log('  sender          :', sender);
  console.log('  rpc             :', rpc);
  console.log('  schemas         :', SCHEMAS.map(s => s.id).join(', '));
  console.log('  mode            :', dryRun ? 'dry-run' : 'submit');

  const client = new SuiClient({ url: rpc });
  const tx = new Transaction();
  tx.setGasBudget(gasBudget);

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

  if (dryRun) {
    const built = await tx.build({ client });
    const simulated = await client.dryRunTransactionBlock({ transactionBlock: built });
    console.log('\n[dry-run] effects:', simulated.effects.status);
    if (simulated.effects.status.status !== 'success') {
      console.error(simulated.effects.status.error);
      process.exit(1);
    }
    console.log('[dry-run] gas used (MIST):', simulated.effects.gasUsed);
    return;
  }

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
  });

  console.log('\n[submit] digest:', result.digest);
  console.log('[submit] status:', result.effects?.status);
  if (result.effects?.status.status !== 'success') {
    console.error(result.effects?.status.error);
    process.exit(1);
  }
  const registered = (result.events ?? [])
    .filter(e => e.type.endsWith('::schema_registry::SchemaRegistered'))
    .map(e => (e.parsedJson as { schema_id: number[] }).schema_id)
    .map(bytes => new TextDecoder().decode(Uint8Array.from(bytes)));
  console.log('[submit] registered:', registered);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
