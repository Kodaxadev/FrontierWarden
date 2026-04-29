/**
 * gas-station.ts — HTTP server exposing POST /sponsor-attestation.
 *
 * Routes:
 *   GET  /health                       → { ok, service, sponsor, time }
 *   POST /sponsor-transaction          → { txBytes, sponsorSignature }
 *   POST /oracle/issue-attestation     → { digest, attestationId }
 *
 * Sponsor body: { txKindBytes: string, sender: string, gasBudget?: number }
 * Oracle body:  { schema_id: string, subject: string, value: number, expiration_epochs?: number }
 *
 * Start:
 *   PORT=3001 SPONSOR_PRIVATE_KEY=suiprivkey1... tsx scripts/gas-station.ts
 *
 * Single responsibility: HTTP transport + request validation.
 * All Sui logic lives in lib/gas-sponsor.ts.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { SuiClient }    from '@mysten/sui/client';
import {
  RPC_URL,
  loadSponsorKeypair,
  sponsorTransaction,
  type SponsorRequest,
} from './lib/gas-sponsor.js';
import { buildIssueAttestationTx } from './lib/oracle-actions.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT    = parseInt(process.env.PORT ?? '3001', 10);
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cors(res: ServerResponse, origin: string | undefined): void {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin',  allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Derive sponsor readiness from env key for /health output. Never throws. */
function sponsorStatus(): { ready: boolean; address: string } {
  try {
    return { ready: true, address: loadSponsorKeypair().toSuiAddress() };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sponsor key unavailable';
    return { ready: false, address: `(${message})` };
  }
}

function sponsorAddress(): string {
  return sponsorStatus().address;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleHealth(res: ServerResponse): Promise<void> {
  const sponsor = sponsorStatus();
  json(res, 200, {
    ok:      true,
    ready:   sponsor.ready,
    service: 'frontierwarden-gas-station',
    rpcUrl:  RPC_URL,
    sponsor: sponsor.address,
    time:    new Date().toISOString(),
  });
}

async function handleSponsor(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Parse body
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, {
      error:   'invalid_json',
      message: 'Request body must be valid JSON.',
    });
    return;
  }

  // Validate required fields
  const b = body as Record<string, unknown>;
  if (
    typeof body !== 'object' || body === null ||
    typeof b.txKindBytes !== 'string'          ||
    typeof b.sender      !== 'string'
  ) {
    json(res, 400, {
      error:   'missing_fields',
      message: 'Body must include { txKindBytes: string, sender: string }.',
    });
    return;
  }

  // Validate sender looks like a Sui address
  if (!/^0x[0-9a-fA-F]{64}$/.test(b.sender)) {
    json(res, 400, {
      error:   'invalid_sender',
      message: 'sender must be a 0x-prefixed 32-byte hex address.',
    });
    return;
  }

  try {
    const result = await sponsorTransaction(body as SponsorRequest);
    json(res, 200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[gas-station] sponsor error:', message);
    json(res, 500, { error: 'sponsor_failed', message });
  }
}

// ---------------------------------------------------------------------------
// Oracle route: POST /oracle/issue-attestation
// ---------------------------------------------------------------------------
// The gas station key IS the oracle key (deployer = oracle).
// This endpoint signs and submits directly — no user co-sign needed.
// NOTE: No auth header in dev. Add API key middleware before production use.

async function handleOracleIssue(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, { error: 'invalid_json', message: 'Request body must be valid JSON.' });
    return;
  }

  const b = body as Record<string, unknown>;
  if (
    typeof b.schema_id !== 'string' || !b.schema_id ||
    typeof b.subject   !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(b.subject) ||
    (typeof b.value !== 'number' && typeof b.value !== 'string')
  ) {
    json(res, 400, {
      error:   'missing_fields',
      message: 'Body must include { schema_id: string, subject: "0x…", value: number }.',
    });
    return;
  }

  try {
    const keypair = loadSponsorKeypair();
    const client  = new SuiClient({ url: RPC_URL });
    const sender  = keypair.toSuiAddress();
    const expEpochs = typeof b.expiration_epochs === 'number'
      ? BigInt(b.expiration_epochs)
      : 200n;

    const tx = buildIssueAttestationTx({
      sender,
      schemaId:         b.schema_id,
      subject:          b.subject,
      value:            BigInt(b.value as number | string),
      expirationEpochs: expEpochs,
    });
    tx.setGasBudget(100_000_000n);

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer:      keypair,
      options:     { showEffects: true, showObjectChanges: true },
    });

    if (result.effects?.status.status !== 'success') {
      json(res, 500, {
        error:   'tx_failed',
        message: result.effects?.status.error ?? 'Transaction failed.',
      });
      return;
    }

    type ObjChange = { type: string; objectType?: string; objectId: string };
    const attestationId = ((result.objectChanges ?? []) as ObjChange[])
      .find(c => c.type === 'created' && c.objectType?.includes('::attestation::Attestation'))
      ?.objectId ?? null;

    console.log(`[oracle] issued ${b.schema_id} → ${b.subject} value=${b.value} tx=${result.digest}`);
    json(res, 200, { digest: result.digest, attestationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[oracle] issue error:', message);
    json(res, 500, { error: 'oracle_error', message });
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  cors(res, req.headers.origin);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url    = req.url?.split('?')[0] ?? '/';
  const method = req.method ?? 'GET';

  try {
    if (method === 'GET' && url === '/health') {
      await handleHealth(res);
    } else if (
      method === 'POST' &&
      (url === '/sponsor-transaction' || url === '/sponsor-attestation')
    ) {
      await handleSponsor(req, res);
    } else if (method === 'POST' && url === '/oracle/issue-attestation') {
      await handleOracleIssue(req, res);
    } else {
      json(res, 404, {
        error:   'not_found',
        message: `${method} ${url} is not a recognised route.`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[gas-station] unhandled error:', message);
    json(res, 500, { error: 'internal_error', message });
  }
});

server.listen(PORT, () => {
  console.log(`[gas-station] Listening  → http://localhost:${PORT}`);
  console.log(`[gas-station] Sponsor    → ${sponsorAddress()}`);
  console.log(`[gas-station] CORS allow → ${ORIGINS.join(', ')}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[gas-station] Port ${PORT} is already in use. Set PORT= to override.`);
  } else {
    console.error('[gas-station] Server error:', err.message);
  }
  process.exit(1);
});
