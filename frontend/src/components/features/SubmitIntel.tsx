// SubmitIntel.tsx -- Gate intel submission form.
//
// Schema picker (tab row) + system address input + value input + 4-step
// status display. Wraps useSubmitIntel hook. Stays under 200 lines.
//
// Visual language: classified-document amber accent, monospace type,
// step indicators that light up progressively like a launch sequence.

import { useState, useId }        from 'react';
import { Panel }                  from '../ui/Panel';
import { SendIcon }               from '../ui/Icons';
import { useSubmitIntel }         from '../../hooks/useSubmitIntel';
import { useCurrentAccount }      from '@mysten/dapp-kit-react';
import type { AttestSchema }      from '../../lib/tx-intel';
import type { SubmitStep }        from '../../hooks/useSubmitIntel';

// ---------------------------------------------------------------------------
// Schema config
// ---------------------------------------------------------------------------

interface SchemaMeta {
  id:    AttestSchema;
  label: string;
  hint:  string;
}

const SCHEMAS: SchemaMeta[] = [
  { id: 'GATE_HOSTILE',      label: 'HOSTILE',   hint: 'Mark gate/system as hostile' },
  { id: 'GATE_CAMPED',       label: 'CAMPED',    hint: 'Mark gate/system as camped' },
  { id: 'GATE_CLEAR',        label: 'CLEAR',     hint: 'Mark gate/system as clear' },
  { id: 'HEAT_TRAP',         label: 'HEAT TRAP', hint: 'Report heat-trap hazard' },
  { id: 'ROUTE_VERIFIED',    label: 'ROUTE OK',  hint: 'Verify route is safe' },
  { id: 'SYSTEM_CONTESTED',  label: 'CONTESTED', hint: 'Report contested system' },
  { id: 'SHIP_KILL',         label: 'SHIP KILL', hint: 'Log a ship kill event' },
  { id: 'PLAYER_BOUNTY',     label: 'BOUNTY',    hint: 'Set a player bounty value' },
];

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEP_ORDER: SubmitStep[] = ['building', 'sponsoring', 'signing', 'executing'];
const STEP_LABELS: Record<string, string> = {
  building:  '01 BUILD',
  sponsoring:'02 SPONSOR',
  signing:   '03 SIGN',
  executing: '04 BROADCAST',
};

function StepTrack({ current }: { current: SubmitStep }) {
  return (
    <div className="flex gap-1.5 mt-2">
      {STEP_ORDER.map((s) => {
        const idx      = STEP_ORDER.indexOf(s);
        const curIdx   = STEP_ORDER.indexOf(current as SubmitStep);
        const active   = s === current;
        const complete = curIdx > idx || current === 'done';
        return (
          <div
            key={s}
            className={[
              'flex-1 flex flex-col gap-0.5',
            ].join(' ')}
          >
            <div className={[
              'h-px rounded-full transition-colors duration-300',
              active   ? 'bg-frontier-amber'      :
              complete ? 'bg-status-clear/60'      :
                         'bg-void-500/40',
            ].join(' ')} />
            <span className={[
              'font-mono text-[8px] tracking-widest',
              active   ? 'text-frontier-amber'         :
              complete ? 'text-status-clear/55'         :
                         'text-void-500/35',
            ].join(' ')}>
              {STEP_LABELS[s]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SubmitIntel() {
  const account = useCurrentAccount();
  const { state, submit, reset } = useSubmitIntel();

  const [schema,  setSchema]  = useState<AttestSchema>('GATE_HOSTILE');
  const [subject, setSubject] = useState('');
  const [value,   setValue]   = useState('1');
  const subjectId = useId();
  const valueId   = useId();

  const busy = ['building','sponsoring','signing','executing'].includes(state.step);
  const canSubmit = !busy && !!account && subject.startsWith('0x') && subject.length >= 10 && Number(value) >= 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    submit({ schema, subject: subject.trim(), value: BigInt(value) });
  }

  const selectedMeta = SCHEMAS.find(s => s.id === schema)!;

  return (
    <Panel
      title="SUBMIT INTEL"
      subtitle={selectedMeta.hint}
      icon={<SendIcon size={13} />}
      accent="amber"
      className="shrink-0"
    >
      <div className="px-3 py-2.5 space-y-3">

        {/* Schema tabs */}
        <div className="flex flex-wrap gap-1">
          {SCHEMAS.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSchema(s.id); reset(); }}
              disabled={busy}
              className={[
                'font-mono text-[9px] tracking-widest px-2 py-0.5 rounded',
                'border transition-colors duration-150',
                s.id === schema
                  ? 'border-frontier-amber/60 text-frontier-amber bg-frontier-amber/10'
                  : 'border-void-500/50 text-void-500/55 hover:border-void-500 hover:text-alloy-silver/60',
                busy ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Input row */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <div>
            <label htmlFor={subjectId} className="block font-mono text-[9px] text-void-500/60 tracking-widest mb-0.5 uppercase">
              Target Address
            </label>
            <input
              id={subjectId}
              type="text"
              value={subject}
              onChange={e => { setSubject(e.target.value); reset(); }}
              placeholder="0x..."
              disabled={busy}
              spellCheck={false}
              className={[
                'w-full bg-void-700 border rounded px-2 py-1.5',
                'font-mono text-[11px] text-alloy-silver placeholder-void-500/40',
                'focus:outline-none focus:border-frontier-amber/50',
                'border-void-500/60 transition-colors',
                busy ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            />
          </div>

          <div>
            <label htmlFor={valueId} className="block font-mono text-[9px] text-void-500/60 tracking-widest mb-0.5 uppercase">
              Value (u64)
            </label>
            <input
              id={valueId}
              type="number"
              min="0"
              value={value}
              onChange={e => { setValue(e.target.value); reset(); }}
              disabled={busy}
              className={[
                'w-full bg-void-700 border rounded px-2 py-1.5',
                'font-mono text-[11px] text-alloy-silver',
                'focus:outline-none focus:border-frontier-amber/50',
                'border-void-500/60 transition-colors',
                busy ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              'w-full py-1.5 rounded border font-mono text-[10px] tracking-[0.18em] uppercase',
              'transition-all duration-150 flex items-center justify-center gap-2',
              canSubmit
                ? 'border-frontier-amber/60 text-frontier-amber bg-frontier-amber/8 hover:bg-frontier-amber/15 hover:border-frontier-amber/80'
                : 'border-void-500/30 text-void-500/35 cursor-not-allowed',
            ].join(' ')}
          >
            {busy ? (
              <span className="animate-pulse">
                {state.step === 'building'   ? 'BUILDING TX…'   :
                 state.step === 'sponsoring' ? 'SPONSORING…'    :
                 state.step === 'signing'    ? 'AWAITING SIG…'  :
                                              'BROADCASTING…'}
              </span>
            ) : (
              <>
                <SendIcon size={11} />
                {!account ? 'CONNECT WALLET' : 'TRANSMIT INTEL'}
              </>
            )}
          </button>
        </form>

        {/* Step track -- shown while in flight */}
        {busy && <StepTrack current={state.step} />}

        {/* Result states */}
        {state.step === 'done' && state.digest && (
          <div className="border border-status-clear/25 rounded px-2 py-1.5 bg-status-clear/5">
            <p className="font-mono text-[9px] text-status-clear/70 tracking-widest">TRANSMITTED</p>
            <p className="font-mono text-[10px] text-status-clear mt-0.5 break-all">
              {state.digest.slice(0, 20)}…{state.digest.slice(-8)}
            </p>
          </div>
        )}

        {state.step === 'error' && state.error && (
          <div className="border border-frontier-crimson/25 rounded px-2 py-1.5 bg-frontier-crimson/5">
            <p className="font-mono text-[9px] text-frontier-crimson/70 tracking-widest mb-0.5">ERROR</p>
            <p className="font-mono text-[10px] text-frontier-crimson/80 leading-relaxed">{state.error}</p>
          </div>
        )}

      </div>
    </Panel>
  );
}
