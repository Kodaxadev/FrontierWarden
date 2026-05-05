import { shortId } from './social-utils';

interface StatusLineProps {
  step: string;
  digest: string | null;
  error: string | null;
}

export function SocialStatusLine({ step, digest, error }: StatusLineProps) {
  if (step === 'idle') return null;
  if (step === 'signing') return <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>Waiting for wallet...</span>;
  if (step === 'done') {
    return <span style={{ fontSize: 10, color: 'var(--c-green)' }}>tx {digest ? shortId(digest) : ''}</span>;
  }
  return <span style={{ fontSize: 10, color: 'var(--c-crimson)' }}>{error}</span>;
}
