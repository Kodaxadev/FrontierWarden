// sui-fetcher-telemetry.ts — durable, browser-local telemetry for the Sui
// object fetcher adapter. Records every fetch call and every shadow comparison
// into an in-memory ring buffer; persists the last N actionable mismatches to
// localStorage so they survive page reload. Exposes window.__suiFetcherTelemetry
// for inspection from DevTools.
//
// Constraints (load-bearing):
// - No network ingestion. Browser-local only.
// - No PII / secrets. Labels are objectId or struct-type strings.
// - Telemetry never throws into the fetch path; record* swallow internal errors.
// - Public API of sui-object-fetcher.ts is not affected.

import type { SuiObjectData } from './sui-object-fetcher';

// ── Public types ─────────────────────────────────────────────────────────────

export type FetchKind = 'object' | 'owned';
export type FetchMode = 'jsonrpc' | 'graphql' | 'shadow';

export type ShadowMatch =
  | 'exact'           // raw JSON equal
  | 'encoding-diff'   // semantic match; content.fields differ (D1–D4)
  | 'mismatch'        // actionable: objectId / type / owner / version / digest disagree
  | 'null-mismatch'   // one side null, the other not
  | 'set-mismatch'    // array kind: rpc/gql object-id sets differ
  | 'error';          // shadow GQL call threw

export interface FetchEvent {
  ts: number;          // epoch ms
  kind: FetchKind;
  mode: FetchMode;
  label: string;       // objectId for 'object', struct type for 'owned' — never wallet addr
  durationMs: number;
  resultCount: number; // 1/0 for object; N for owned arrays
  ok: boolean;
}

export interface ShadowEvent {
  ts: number;
  kind: FetchKind;
  label: string;
  match: ShadowMatch;
  diffKeys?: string[];      // for 'mismatch': field names that disagreed
  rpcCount?: number;        // 'set-mismatch' arrays
  gqlCount?: number;
  missing?: string[];       // 'set-mismatch': objectIds in rpc but not gql
  extra?: string[];         // 'set-mismatch': objectIds in gql but not rpc
  errorMessage?: string;
}

interface Counters {
  fetchTotal: number;
  fetchByMode: Record<FetchMode, number>;
  shadowTotal: number;
  shadowByMatch: Record<ShadowMatch, number>;
}

export interface TelemetrySnapshot {
  counters: Counters;
  fetchEvents: FetchEvent[];
  shadowEvents: ShadowEvent[];
  persistedMismatches: ShadowEvent[];
}

// ── Module state ─────────────────────────────────────────────────────────────

const TAG = '[sui-fetcher-telemetry]';
const MAX_EVENTS = 500;
const MAX_PERSISTED = 50;
const LS_KEY = 'sui-fetcher-telemetry-mismatches-v1';

const fetchEvents: FetchEvent[] = [];
const shadowEvents: ShadowEvent[] = [];

const counters: Counters = {
  fetchTotal: 0,
  fetchByMode: { jsonrpc: 0, graphql: 0, shadow: 0 },
  shadowTotal: 0,
  shadowByMatch: {
    exact: 0,
    'encoding-diff': 0,
    mismatch: 0,
    'null-mismatch': 0,
    'set-mismatch': 0,
    error: 0,
  },
};

function isDev(): boolean {
  try {
    return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

function isActionable(match: ShadowMatch): boolean {
  return match === 'mismatch' || match === 'null-mismatch' || match === 'set-mismatch' || match === 'error';
}

function pushCapped<T>(buf: T[], evt: T): void {
  buf.push(evt);
  while (buf.length > MAX_EVENTS) buf.shift();
}

function persistMismatch(evt: ShadowEvent): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LS_KEY);
    const list: ShadowEvent[] = raw ? JSON.parse(raw) : [];
    list.push(evt);
    while (list.length > MAX_PERSISTED) list.shift();
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded or JSON failure — telemetry is best-effort
  }
}

function readPersisted(): ShadowEvent[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ShadowEvent[]) : [];
  } catch {
    return [];
  }
}

// ── Recording API ────────────────────────────────────────────────────────────

export function recordFetch(evt: FetchEvent): void {
  try {
    counters.fetchTotal += 1;
    counters.fetchByMode[evt.mode] += 1;
    pushCapped(fetchEvents, evt);
    if (isDev()) {
      // eslint-disable-next-line no-console
      console.debug(`${TAG} fetch[${evt.mode}/${evt.kind}] ${evt.label} → ${evt.resultCount} in ${evt.durationMs}ms`);
    }
  } catch {
    // never propagate
  }
}

function recordShadow(evt: ShadowEvent): void {
  try {
    counters.shadowTotal += 1;
    counters.shadowByMatch[evt.match] += 1;
    pushCapped(shadowEvents, evt);
    if (isActionable(evt.match)) {
      persistMismatch(evt);
      // eslint-disable-next-line no-console
      console.warn(`${TAG} ✗ ${evt.match}: ${evt.label}`, evt);
    } else if (isDev()) {
      const marker = evt.match === 'exact' ? '✓' : '✓ (encoding diff)';
      // eslint-disable-next-line no-console
      console.debug(`${TAG} ${marker} ${evt.match}: ${evt.label}`);
    }
  } catch {
    // never propagate
  }
}

// ── Semantic comparison (lifted from sui-object-fetcher.ts) ─────────────────
// Rules preserved verbatim from the prior _shadowSingle / _shadowArray helpers.

function fieldsDiffer(a: SuiObjectData | null, b: SuiObjectData | null): boolean {
  return JSON.stringify(a?.content?.fields) !== JSON.stringify(b?.content?.fields);
}

function diffKey(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function compareObject(
  label: string,
  kind: FetchKind,
  rpc: SuiObjectData | null,
  gql: SuiObjectData | null,
): void {
  if (!rpc && !gql) {
    recordShadow({ ts: Date.now(), kind, label, match: 'exact' });
    return;
  }
  if (!rpc || !gql) {
    recordShadow({ ts: Date.now(), kind, label, match: 'null-mismatch' });
    return;
  }
  const diffs: string[] = [];
  if (diffKey(rpc.objectId, gql.objectId)) diffs.push('objectId');
  if (diffKey(rpc.type, gql.type)) diffs.push('type');
  if (rpc.version && gql.version && diffKey(rpc.version, gql.version)) diffs.push('version');
  if (rpc.digest && gql.digest && diffKey(rpc.digest, gql.digest)) diffs.push('digest');
  if (diffKey(rpc.owner, gql.owner)) diffs.push('owner');

  if (diffs.length > 0) {
    recordShadow({ ts: Date.now(), kind, label, match: 'mismatch', diffKeys: diffs });
    return;
  }
  recordShadow({
    ts: Date.now(),
    kind,
    label,
    match: fieldsDiffer(rpc, gql) ? 'encoding-diff' : 'exact',
  });
}

export function compareArray(
  label: string,
  kind: FetchKind,
  rpc: SuiObjectData[],
  gql: SuiObjectData[],
): void {
  const rIds = new Set(rpc.map((o) => o.objectId).filter((id): id is string => !!id));
  const gIds = new Set(gql.map((o) => o.objectId).filter((id): id is string => !!id));
  const missing = [...rIds].filter((id) => !gIds.has(id));
  const extra = [...gIds].filter((id) => !rIds.has(id));
  if (missing.length || extra.length) {
    recordShadow({
      ts: Date.now(),
      kind,
      label,
      match: 'set-mismatch',
      rpcCount: rpc.length,
      gqlCount: gql.length,
      missing,
      extra,
    });
    return;
  }
  let anyMismatch = false;
  for (const ro of rpc) {
    const go = gql.find((g) => g.objectId === ro.objectId);
    if (!go) continue;
    const diffs: string[] = [];
    if (diffKey(ro.type, go.type)) diffs.push('type');
    if (diffKey(ro.owner, go.owner)) diffs.push('owner');
    if (diffs.length) {
      anyMismatch = true;
      recordShadow({
        ts: Date.now(),
        kind,
        label: `${label}[${ro.objectId?.slice(0, 10)}…]`,
        match: 'mismatch',
        diffKeys: diffs,
      });
    }
  }
  if (anyMismatch) return;
  const enc = rpc.some((ro) => {
    const go = gql.find((g) => g.objectId === ro.objectId);
    return !!go && fieldsDiffer(ro, go);
  });
  recordShadow({
    ts: Date.now(),
    kind,
    label: `${label} (${rpc.length})`,
    match: enc ? 'encoding-diff' : 'exact',
  });
}

export function recordShadowError(label: string, kind: FetchKind, err: unknown): void {
  recordShadow({
    ts: Date.now(),
    kind,
    label,
    match: 'error',
    errorMessage: err instanceof Error ? err.message : String(err),
  });
}

// ── Inspector (window-exposed) ───────────────────────────────────────────────

function snapshot(): TelemetrySnapshot {
  return {
    counters: {
      fetchTotal: counters.fetchTotal,
      fetchByMode: { ...counters.fetchByMode },
      shadowTotal: counters.shadowTotal,
      shadowByMatch: { ...counters.shadowByMatch },
    },
    fetchEvents: [...fetchEvents],
    shadowEvents: [...shadowEvents],
    persistedMismatches: readPersisted(),
  };
}

function summary(): string {
  const s = snapshot();
  const c = s.counters;
  return [
    `fetch total: ${c.fetchTotal} (jsonrpc=${c.fetchByMode.jsonrpc} graphql=${c.fetchByMode.graphql} shadow=${c.fetchByMode.shadow})`,
    `shadow total: ${c.shadowTotal}`,
    `  exact:          ${c.shadowByMatch.exact}`,
    `  encoding-diff:  ${c.shadowByMatch['encoding-diff']}`,
    `  mismatch:       ${c.shadowByMatch.mismatch}`,
    `  null-mismatch:  ${c.shadowByMatch['null-mismatch']}`,
    `  set-mismatch:   ${c.shadowByMatch['set-mismatch']}`,
    `  error:          ${c.shadowByMatch.error}`,
    `persisted mismatches: ${s.persistedMismatches.length}`,
  ].join('\n');
}

function reset(): void {
  fetchEvents.length = 0;
  shadowEvents.length = 0;
  counters.fetchTotal = 0;
  counters.shadowTotal = 0;
  (Object.keys(counters.fetchByMode) as FetchMode[]).forEach((k) => { counters.fetchByMode[k] = 0; });
  (Object.keys(counters.shadowByMatch) as ShadowMatch[]).forEach((k) => { counters.shadowByMatch[k] = 0; });
}

function clearPersisted(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

declare global {
  interface Window {
    __suiFetcherTelemetry?: {
      summary: () => string;
      dump: () => TelemetrySnapshot;
      reset: () => void;
      clearPersisted: () => void;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__suiFetcherTelemetry = { summary, dump: snapshot, reset, clearPersisted };
}
