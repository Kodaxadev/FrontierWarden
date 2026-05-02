import { Buffer } from 'node:buffer';

const sui = await loadSuiVerifier();

const DEFAULT_GRAPHQL_URLS = [
  'https://graphql.testnet.sui.io/graphql',
  'https://graphql.mainnet.sui.io/graphql',
];

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function candidateUrls() {
  const configured = process.env.SUI_GRAPHQL_URL?.trim();
  return configured
    ? [configured, ...DEFAULT_GRAPHQL_URLS.filter(url => url !== configured)]
    : DEFAULT_GRAPHQL_URLS;
}

async function verify(input) {
  if (!input?.message || !input?.signature || !input?.address) {
    throw new Error('message, signature, and address are required');
  }

  const message = new TextEncoder().encode(String(input.message));
  let lastError = null;

  for (const url of candidateUrls()) {
    try {
      const client = new sui.SuiGraphQLClient({ url });
      await sui.verifyPersonalMessageSignature(message, String(input.signature), {
        address: String(input.address).toLowerCase(),
        client,
      });
      return { ok: true, verifier: 'mysten-js', graphqlUrl: url };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('signature verification failed');
}

async function loadSuiVerifier() {
  try {
    const [verify, graphql] = await Promise.all([
      import('../frontend/node_modules/@mysten/sui/dist/verify/index.mjs'),
      import('../frontend/node_modules/@mysten/sui/dist/graphql/index.mjs'),
    ]);
    return {
      verifyPersonalMessageSignature: verify.verifyPersonalMessageSignature,
      SuiGraphQLClient: graphql.SuiGraphQLClient,
    };
  } catch {
    const [verify, graphql] = await Promise.all([
      import('@mysten/sui/verify'),
      import('@mysten/sui/graphql'),
    ]);
    return {
      verifyPersonalMessageSignature: verify.verifyPersonalMessageSignature,
      SuiGraphQLClient: graphql.SuiGraphQLClient,
    };
  }
}

try {
  const input = JSON.parse(await readStdin());
  const result = await verify(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
