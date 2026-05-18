// fw-action-telemetry.ts — browser-local telemetry for the wallet action path.
// Complements ./sui-fetcher-telemetry by covering the layer ABOVE the JSON-RPC
// adapter: the useSponsoredTransaction flow (build → sponsor → sign → execute)
// and the direct-sign flow (vouch, dispute) that call dAppKit.signAndExecute
// without going through makeSuiJsonRpcClient.
//
// Records: phase, flow, label, walletName, durationMs, errorClass.
// Never records: signatures, tx bytes, session tokens, API keys, private keys.

import type { SponsoredErrorClass } from './sponsored-diagnostics';

// ── Public types ─────────────────────────────────────────────────────────────

export type ActionFlow = 'sponsored' | 'direct';

export type ActionPhase =
  | 'started'
  | 'build_ok'
  | 'build_failed'
  | 'sponsor_request'
  | 'sponsor_ok'
  | 'sponsor_failed'
  | 'wallet_sign_requested'
  | 'wallet_sign_ok'
  | 'wallet_sign_failed'
  | 'execute_requested'
  | 'execute_ok'
  | 'execute_failed'
  | 'done'
  | 'failed';

export type ActionErrorClass =
  | SponsoredErrorClass
  | 'wallet_not_connected'
  | 'config_missing'
  | 'unknown';

export interface ActionEvent {
  ts: number;
  flow: ActionFlow;
  label: string;             // static action name; never an object ID or wallet
  phase: ActionPhase;
  durationFromStartMs?: number;
  walletName?: string | null;
  errorClass?: ActionErrorClass;
}

interface ActionCounters {
  totalStarted: number;
  totalDone: number;
  totalFailed: number;
  byFlow: Record<ActionFlow, number>;
  byPhase: Record<string, number>;
  byLabel: Record<string, number>;
  byErrorClass: Record<string, number>;
}

export interface ActionTelemetrySnapshot {
  counters: ActionCounters;
  events: ActionEvent[];
}

// ── Module state ─────────────────────────────────────────────────────────────

const TAG = '[fw-action-telemetry]';
const MAX_EVENTS = 500;

const events: ActionEvent[] = [];

const counters: ActionCounters = {
  totalStarted: 0,
  totalDone: 0,
  totalFailed: 0,
  byFlow: { sponsored: 0, direct: 0 },
  byPhase: {},
  byLabel: {},
  byErrorClass: {},
};

function isDev(): boolean {
  try {
    return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

function pushCapped<T>(buf: T[], evt: T): void {
  buf.push(evt);
  while (buf.length > MAX_EVENTS) buf.shift();
}

function bump(map: Record<string, number>, key: string | undefined): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

// ── Recording API ────────────────────────────────────────────────────────────

export function recordAction(evt: ActionEvent): void {
  try {
    pushCapped(events, evt);
    bump(counters.byPhase, evt.phase);
    bump(counters.byLabel, evt.label);
    if (evt.errorClass) bump(counters.byErrorClass, evt.errorClass);
    counters.byFlow[evt.flow] += 1;
    if (evt.phase === 'started') counters.totalStarted += 1;
    if (evt.phase === 'done') counters.totalDone += 1;
    if (evt.phase === 'failed') counters.totalFailed += 1;
    if (isDev()) {
      const dur = evt.durationFromStartMs != null ? ` +${evt.durationFromStartMs}ms` : '';
      const err = evt.errorClass ? ` err=${evt.errorClass}` : '';
      // eslint-disable-next-line no-console
      console.debug(`${TAG} [${evt.flow}/${evt.label}] ${evt.phase}${dur}${err}`);
    }
  } catch {
    // best-effort: never throw into the action path
  }
}

// Convenience helper used by hooks: closes over flow/label/walletName/start
// so callsites pass only phase + optional errorClass.
export function makeActionRecorder(
  flow: ActionFlow,
  label: string,
  walletName: string | null,
): (phase: ActionPhase, errorClass?: ActionErrorClass) => void {
  const start = Date.now();
  return (phase, errorClass) => {
    recordAction({
      ts: Date.now(),
      flow,
      label,
      phase,
      walletName,
      durationFromStartMs: Date.now() - start,
      errorClass,
    });
  };
}

// ── Inspector ────────────────────────────────────────────────────────────────

function snapshot(): ActionTelemetrySnapshot {
  return {
    counters: {
      totalStarted: counters.totalStarted,
      totalDone: counters.totalDone,
      totalFailed: counters.totalFailed,
      byFlow: { ...counters.byFlow },
      byPhase: { ...counters.byPhase },
      byLabel: { ...counters.byLabel },
      byErrorClass: { ...counters.byErrorClass },
    },
    events: [...events],
  };
}

function formatMap(m: Record<string, number>): string {
  const entries = Object.entries(m);
  if (!entries.length) return '(none)';
  return entries.map(([k, v]) => `${k}=${v}`).join(' ');
}

function summary(): string {
  const s = snapshot();
  const c = s.counters;
  return [
    `actions started: ${c.totalStarted}  done: ${c.totalDone}  failed: ${c.totalFailed}`,
    `flow:   ${formatMap(c.byFlow as unknown as Record<string, number>)}`,
    `label:  ${formatMap(c.byLabel)}`,
    `phase:  ${formatMap(c.byPhase)}`,
    `errors: ${formatMap(c.byErrorClass)}`,
    `events in buffer: ${s.events.length} / ${MAX_EVENTS}`,
  ].join('\n');
}

function reset(): void {
  events.length = 0;
  counters.totalStarted = 0;
  counters.totalDone = 0;
  counters.totalFailed = 0;
  counters.byFlow.sponsored = 0;
  counters.byFlow.direct = 0;
  for (const k of Object.keys(counters.byPhase)) delete counters.byPhase[k];
  for (const k of Object.keys(counters.byLabel)) delete counters.byLabel[k];
  for (const k of Object.keys(counters.byErrorClass)) delete counters.byErrorClass[k];
}

declare global {
  interface Window {
    __fwActionTelemetry?: {
      summary: () => string;
      dump: () => ActionTelemetrySnapshot;
      reset: () => void;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__fwActionTelemetry = { summary, dump: snapshot, reset };
}
