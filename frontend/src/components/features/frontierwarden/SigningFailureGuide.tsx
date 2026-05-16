import { useState } from 'react';
import type { SponsoredErrorClass } from '../../../lib/sponsored-diagnostics';

export interface SigningFailureGuideProps {
  errorClass: SponsoredErrorClass | null;
  error: string | null;
  onRetry?: () => void;
  onReset?: () => void;
}

type RetryKind = 'none' | 'immediate' | 'wait' | 'reconnect';

interface GuidanceEntry {
  title: string;
  detail: string;
  retry: RetryKind;
}

const GUIDANCE: Record<SponsoredErrorClass, GuidanceEntry> = {
  proof_rate_limited: {
    title: 'zkLogin proof generation rate limited',
    detail: 'EVE Vault proof generation is rate limited. Wait 30–60 seconds and try again. No protocol state was changed.',
    retry: 'wait',
  },
  wallet_zk_proof_fetch_failed: {
    title: 'Wallet could not fetch zkLogin proof',
    detail: 'Your wallet could not fetch a zkLogin proof. This is usually temporary. Wait a minute and try again. EVE Vault proof generation may be rate limited.',
    retry: 'wait',
  },
  wallet_sign_rejected: {
    title: 'Transaction rejected',
    detail: 'The transaction was rejected in your wallet. No protocol state was changed.',
    retry: 'immediate',
  },
  wallet_feature_missing: {
    title: 'Wallet feature unsupported',
    detail: 'Your wallet does not support the required signing feature. Try disconnecting and reconnecting your wallet.',
    retry: 'reconnect',
  },
  sponsor_api_failed: {
    title: 'Gas station unreachable',
    detail: 'The FrontierWarden gas station could not be reached. Check your connection and try again.',
    retry: 'immediate',
  },
  sponsor_response_invalid: {
    title: 'Gas station returned unexpected response',
    detail: 'The gas station response could not be validated. Try again or contact the operator.',
    retry: 'immediate',
  },
  transaction_from_sponsored_bytes_failed: {
    title: 'Sponsored transaction reconstruction failed',
    detail: 'The sponsored transaction could not be reconstructed from the gas station response. Try again.',
    retry: 'immediate',
  },
  execute_transaction_failed: {
    title: 'On-chain execution failed',
    detail: 'The transaction was submitted but failed on-chain. No permanent state change unless a digest was returned. Check the diagnostic details below.',
    retry: 'none',
  },
  move_abort: {
    title: 'Protocol aborted transaction',
    detail: 'The Move contract aborted this transaction. Check your gate configuration and standing attestation.',
    retry: 'none',
  },
  missing_attestation: {
    title: 'No standing attestation found',
    detail: 'No active TRIBE_STANDING attestation was found for this wallet. Ensure your attestation is current before retrying.',
    retry: 'none',
  },
  payment_coin_missing: {
    title: 'No SUI coin available',
    detail: 'No traveler-owned SUI coin was found. Ensure your wallet holds SUI.',
    retry: 'none',
  },
  build_kind_failed: {
    title: 'Transaction build failed',
    detail: 'The transaction could not be built. Check your gate configuration and try again.',
    retry: 'immediate',
  },
  indexer_lag: {
    title: 'Indexer catching up',
    detail: 'The indexer is still processing recent blocks. Wait a moment and try again.',
    retry: 'wait',
  },
  unknown_wallet_failure: {
    title: 'Unexpected wallet error',
    detail: 'An unexpected error occurred in the wallet. Try disconnecting and reconnecting, then try again.',
    retry: 'reconnect',
  },
};

export function SigningFailureGuide({ errorClass, error, onRetry, onReset }: SigningFailureGuideProps) {
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  if (!errorClass && !error) return null;

  const guidance = errorClass ? GUIDANCE[errorClass] : null;
  const title = guidance?.title ?? 'Transaction failed';
  const detail = guidance?.detail ?? null;
  const retryKind = guidance?.retry ?? 'none';
  const showRetry = retryKind !== 'none' && !!onRetry;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ color: 'var(--c-crimson)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
        {title}
      </div>
      {detail && (
        <div className="c-sub" style={{ marginBottom: 8 }}>
          {detail}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {showRetry && (
          <button
            className="c-commit"
            onClick={onRetry}
            style={{ fontSize: 10, padding: '4px 12px' }}
          >
            {retryKind === 'reconnect' ? 'RETRY AFTER RECONNECT' : 'TRY AGAIN'}
          </button>
        )}
        {onReset && (
          <button
            onClick={onReset}
            style={{
              fontSize: 10, padding: '4px 10px', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--c-border)',
              color: 'var(--c-mid)',
            }}
          >
            DISMISS
          </button>
        )}
        {error && (
          <button
            onClick={() => setShowDiagnostic(p => !p)}
            style={{
              fontSize: 10, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--c-mid)', padding: 0,
            }}
          >
            {showDiagnostic ? '▼ hide details' : '▶ diagnostic details'}
          </button>
        )}
      </div>
      {showDiagnostic && error && (
        <div style={{
          marginTop: 6, padding: '6px 10px',
          background: 'rgba(0,0,0,0.3)', border: '1px solid var(--c-border)',
          fontSize: 10, color: 'var(--c-mid)', fontFamily: 'monospace',
          wordBreak: 'break-all', lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
