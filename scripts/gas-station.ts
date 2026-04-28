/**
 * gas-station.ts — HTTP server exposing POST /sponsor-attestation.
 *
 * Routes:
 *   GET  /health              → { ok, service, sponsor, time }
 *   POST /sponsor-attestation → { txBytes, sponsorSignature } | { error, message }
 *
 * POST body: { txKindBytes: string, sender: string, gasBudget?: number }
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
import { decodeSuiPrivateKey }  from '@mysten/sui/cryptography';
import { Ed25519Keypair }       from '@mysten/sui/keypairs/ed25519';
import {
  sponsorTransaction,
  type SponsorRequest,
} from './lib/gas-sponsor.js';

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

/** Derive sponsor address from env key for /health output. Never throws. */
function sponsorAddress(): string {
  try {
    const raw = process.env.SPONSOR_PRIVATE_KEY ?? '';
    const { schema, secretKey } = decodeSuiPrivateKey(raw);
    if (schema !== 'ED25519') return '(bad key schema)';
    return Ed25519Keypair.fromSecretKey(secretKey).toSuiAddress();
  } catch {
    return '(SPONSOR_PRIVATE_KEY not set)';
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleHealth(res: ServerResponse): Promise<void> {
  json(res, 200, {
    ok:      true,
    service: 'frontierwarden-gas-station',
    sponsor: sponsorAddress(),
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
    } else if (method === 'POST' && url === '/sponsor-attestation') {
      await handleSponsor(req, res);
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
