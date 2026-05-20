// WatchlistView — P1 creditor tool: saved counterparties with at-a-glance status.
// Fetches identity + trust evaluation for each entry on mount.

import { useCallback, useEffect, useState } from 'react';
import { evaluateTrust, fetchEveIdentity } from '../../../../lib/api';
import { normalizeSuiAddress } from '../../../../lib/format';
import type { EveIdentity, TrustEvaluateResponse } from '../../../../types/api.types';
import type { WatchlistEntry } from '../../../../hooks/useWatchlist';

interface Props {
  entries: WatchlistEntry[];
  onRemove: (address: string) => void;
  onUpdate: (address: string, patch: { label?: string; notes?: string }) => void;
  onLookup: (address: string) => void;
}

interface EnrichedEntry extends WatchlistEntry {
  identity: EveIdentity | null;
  trust: TrustEvaluateResponse | null;
  enrichLoading: boolean;
}

function shortAddr(v: string): string {
  if (v.length <= 14) return v;
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

export function WatchlistView({ entries, onRemove, onUpdate, onLookup }: Props) {
  const [enriched, setEnriched] = useState<EnrichedEntry[]>([]);
  const [editingAddr, setEditingAddr] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Enrich on mount / entry change
  useEffect(() => {
    // Initialize all as loading
    setEnriched(entries.map(e => ({ ...e, identity: null, trust: null, enrichLoading: true })));

    // Fire enrichment for each
    entries.forEach((entry, idx) => {
      const normalized = normalizeSuiAddress(entry.address);
      Promise.all([
        fetchEveIdentity(normalized).catch(() => null),
        evaluateTrust({
          entity: normalized,
          action: 'counterparty_risk',
          context: { schemaId: 'TRIBE_STANDING', minimumScore: 0 },
        }).catch(() => null),
      ]).then(([identity, trust]) => {
        setEnriched(prev => prev.map((e, i) =>
          i === idx ? { ...e, identity, trust, enrichLoading: false } : e
        ));
      });
    });
  }, [entries.length]); // Re-enrich when list size changes

  function startEdit(entry: WatchlistEntry) {
    setEditingAddr(entry.address);
    setEditLabel(entry.label);
    setEditNotes(entry.notes);
  }

  function saveEdit() {
    if (editingAddr) {
      onUpdate(editingAddr, { label: editLabel, notes: editNotes });
      setEditingAddr(null);
    }
  }

  return (
    <>
      <div className="c-view__title">Credit Watchlist</div>
      <div className="c-sub" style={{ marginBottom: 16 }}>
        Track counterparties you're monitoring. Add entries from Counterparty Lookup. Scores refresh on page load.
      </div>

      {entries.length === 0 ? (
        <div style={{
          padding: '40px 0', textAlign: 'center',
          fontSize: 11, color: 'var(--c-mid)',
        }}>
          No counterparties on your watchlist yet. Use Counterparty Lookup to add entries.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {enriched.map(entry => {
            const isEditing = editingAddr === entry.address;
            const charName = entry.identity?.character_name;
            const tribe = entry.identity?.tribe_name;
            const decision = entry.trust?.decision;
            const score = entry.trust?.score;
            const confidence = entry.trust?.confidence;

            return (
              <div key={entry.address} style={{
                border: '1px solid var(--c-border)',
                padding: '14px 18px',
                background: 'rgba(255,255,255,0.012)',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 16,
                alignItems: 'start',
              }}>
                <div>
                  {/* Identity line */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-hi)' }}>
                      {charName ?? entry.label}
                    </span>
                    {tribe && <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>{tribe}</span>}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--c-mono)', color: 'var(--c-mid)', marginBottom: 8 }}>
                    {entry.address}
                  </div>

                  {/* Quick stats row */}
                  {entry.enrichLoading ? (
                    <div className="c-sub">Loading...</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--c-mid)' }}>
                      <span>
                        Score: <strong style={{
                          color: score != null && score >= 500 ? 'var(--c-green, #5ee28a)' : score != null ? 'var(--c-amber)' : 'var(--c-mid)',
                        }}>{score ?? '—'}</strong>
                      </span>
                      <span>
                        Decision: <strong style={{
                          color: decision === 'ALLOW' || decision === 'ALLOW_FREE' || decision === 'ALLOW_TAXED'
                            ? 'var(--c-green, #5ee28a)' : decision === 'DENY' ? 'var(--c-crimson)' : 'var(--c-mid)',
                        }}>{decision ?? '—'}</strong>
                      </span>
                      {confidence != null && (
                        <span>Confidence: <strong>{Math.round(confidence * 100)}%</strong></span>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {isEditing ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        className="c-input"
                        style={{ fontSize: 11, padding: '4px 8px', width: 160 }}
                        placeholder="Label"
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                      />
                      <input
                        className="c-input"
                        style={{ fontSize: 11, padding: '4px 8px', flex: 1, minWidth: 200 }}
                        placeholder="Notes..."
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                      />
                      <button className="c-commit" style={{ fontSize: 9, padding: '4px 10px' }} onClick={saveEdit}>SAVE</button>
                      <button className="c-tab" style={{ fontSize: 9 }} onClick={() => setEditingAddr(null)}>CANCEL</button>
                    </div>
                  ) : entry.notes ? (
                    <div className="c-sub" style={{ marginTop: 6, fontStyle: 'italic' }}>{entry.notes}</div>
                  ) : null}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                  <button
                    className="c-context-cell__action--link"
                    onClick={() => onLookup(entry.address)}
                  >
                    FULL DOSSIER
                  </button>
                  <button
                    className="c-context-cell__action--link"
                    onClick={() => startEdit(entry)}
                  >
                    EDIT
                  </button>
                  <button
                    className="c-context-cell__action--link"
                    style={{ color: 'var(--c-crimson)' }}
                    onClick={() => onRemove(entry.address)}
                  >
                    REMOVE
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
