// InfoTooltip — lightweight educational tooltip for FrontierWarden operator UI.
//
// Shows a small ? trigger button. On hover or keyboard focus a popover appears
// above the trigger with the concept term and explanatory body text.
//
// Accessibility: role="tooltip", aria-describedby link, keyboard focus supported.
// Layout: position:absolute, high z-index. Does not require a Portal.

import { useState } from 'react';
import type { HelpConcept } from './operator-help';

interface Props {
  concept: HelpConcept;
  /** Left margin (px) for inline placement next to labels. Default 6. */
  ml?: number;
}

export function InfoTooltip({ concept, ml = 6 }: Props) {
  const [visible, setVisible] = useState(false);
  const id = `tip-${concept.term.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: ml }}>
      <button
        type="button"
        aria-label={`What is ${concept.term}?`}
        aria-describedby={visible ? id : undefined}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid var(--c-border)',
          background: 'transparent',
          color: 'var(--c-mid)',
          fontSize: 9,
          lineHeight: 1,
          cursor: 'default',
          padding: 0,
          flexShrink: 0,
          verticalAlign: 'middle',
        }}
      >
        ?
      </button>

      {visible && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 240,
            padding: '8px 10px',
            background: 'var(--c-bg)',
            border: '1px solid var(--c-border)',
            zIndex: 9999,
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }}
        >
          <div style={{
            fontSize: 10,
            color: 'var(--c-hi)',
            fontFamily: 'var(--c-mono)',
            marginBottom: 4,
            letterSpacing: '0.03em',
          }}>
            {concept.term}
          </div>
          <div style={{ fontSize: 10, color: 'var(--c-mid)', lineHeight: 1.6 }}>
            {concept.body}
          </div>
        </span>
      )}
    </span>
  );
}
