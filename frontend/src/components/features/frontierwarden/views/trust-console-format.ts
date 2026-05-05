import type { TrustEvaluateResponse } from '../../../../types/api.types';

export const shortId = (value: string) =>
  value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;

export function humanReadableWarning(raw: string): { label: string; critical: boolean } {
  if (raw.startsWith('ATTESTATION_UNDER_CHALLENGE:')) {
    return { label: `Attestation is under fraud challenge: ${raw.split(':')[1]}`, critical: true };
  }
  if (raw.startsWith('ATTESTATION_REVOKED')) {
    return { label: 'Attestation has been revoked', critical: true };
  }
  if (raw.startsWith('INDEXER_LAST_EVENT_STALE_SECONDS:')) {
    const secs = raw.split(':')[1];
    return { label: `Indexer has not seen a new event for ${secs} seconds`, critical: false };
  }
  if (raw.startsWith('PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:')) {
    const delta = raw.split(':')[1];
    return {
      label: `Proof checkpoint is behind latest indexed checkpoint (delta: ${Number(delta).toLocaleString()})`,
      critical: false,
    };
  }
  if (raw === 'PROOF_CHECKPOINT_UNKNOWN') {
    return { label: 'Proof checkpoint could not be determined', critical: false };
  }
  if (raw === 'INDEXER_CHECKPOINT_UNKNOWN') {
    return { label: 'Indexer checkpoint could not be determined', critical: false };
  }
  return { label: raw, critical: false };
}

export const formatMist = (mist: number | null | undefined) => {
  if (mist == null) return '-';
  if (mist === 0) return '0 SUI';
  return `${(mist / 1_000_000_000).toFixed(3)} SUI`;
};

export const badgeClass = (result: TrustEvaluateResponse | null) => {
  if (!result) return 'c-badge--closed';
  switch (result.decision) {
    case 'ALLOW_FREE':
    case 'ALLOW':
      return 'c-badge--ok';
    case 'ALLOW_TAXED':
      return 'c-badge--toll';
    case 'DENY':
      return 'c-badge--crit';
    case 'INSUFFICIENT_DATA':
      return 'c-badge--closed';
    default:
      return 'c-badge--closed';
  }
};
