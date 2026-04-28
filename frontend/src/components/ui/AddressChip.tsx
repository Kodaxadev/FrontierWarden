// AddressChip — monospace address display with copy-on-click.

import { useState } from 'react';
import { truncAddr } from '../../lib/format';

interface AddressChipProps {
  address:   string;
  chars?:    number; // chars to show each side
  className?: string;
}

export function AddressChip({ address, chars = 4, className = '' }: AddressChipProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={address}
      aria-label={`Copy address ${address}`}
      className={[
        'font-mono text-[11px] text-alloy-silver/70 hover:text-sui-cyan',
        'transition-colors duration-100 cursor-pointer select-none',
        className,
      ].join(' ')}
    >
      {copied ? (
        <span className="text-status-clear">✓ copied</span>
      ) : (
        truncAddr(address, chars)
      )}
    </button>
  );
}
