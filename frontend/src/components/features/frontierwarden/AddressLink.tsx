// AddressLink — clickable address that copies to clipboard and optionally navigates.
// Used across views to make wallet addresses actionable.

import { useState } from 'react';

interface Props {
  address: string;
  /** Called when user clicks "Lookup" action. Navigates to Counterparty Lookup. */
  onLookup?: (address: string) => void;
  mono?: boolean;
  size?: number;
}

function shortAddr(v: string): string {
  if (v.length <= 14) return v;
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

export function AddressLink({ address, onLookup, mono = true, size = 10 }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard not available */ }
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: mono ? 'var(--c-mono)' : undefined,
      fontSize: size, color: 'var(--c-mid)',
    }}>
      <span
        onClick={handleCopy}
        title={`${address}\nClick to copy`}
        style={{ cursor: 'pointer', transition: 'color 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--c-hi)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--c-mid)')}
      >
        {copied ? 'copied!' : shortAddr(address)}
      </span>
      {onLookup && (
        <button
          onClick={e => { e.stopPropagation(); onLookup(address); }}
          style={{
            all: 'unset', cursor: 'pointer',
            fontSize: 8, color: 'var(--c-amber)',
            letterSpacing: '0.04em',
          }}
          title="Look up this address"
        >
          ↗
        </button>
      )}
    </span>
  );
}
