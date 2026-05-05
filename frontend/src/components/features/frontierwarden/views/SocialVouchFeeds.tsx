import type { VouchRow } from '../../../../types/api.types';
import { formatSui, shortId } from './social-utils';

interface SocialVouchFeedsProps {
  accountConnected: boolean;
  feedLoading: boolean;
  receivedVouches: VouchRow[];
  givenVouches: VouchRow[];
}

export function SocialVouchFeeds({
  accountConnected,
  feedLoading,
  receivedVouches,
  givenVouches,
}: SocialVouchFeedsProps) {
  return (
    <>
      {!accountConnected && <div className="c-sub">Connect wallet to see vouch history.</div>}
      {accountConnected && feedLoading && <div className="c-sub">Loading vouches...</div>}

      <div className="c-view__title" style={{ marginBottom: 10 }}>Vouches Backing You</div>
      {accountConnected && !feedLoading && receivedVouches.length === 0 && (
        <div className="c-sub" style={{ marginBottom: 16 }}>No vouches received by this wallet.</div>
      )}
      {receivedVouches.length > 0 && (
        <table className="c-table" style={{ marginBottom: 24 }}>
          <thead><tr><th>Vouch ID</th><th>From (voucher)</th><th>Stake</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
          <tbody>
            {receivedVouches.map(row => (
              <tr key={row.vouch_id} style={{ opacity: row.redeemed ? 0.45 : 1 }}>
                <td><div style={{ fontSize: 12 }}>{shortId(row.vouch_id)}</div><div className="c-sub">{row.created_at}</div></td>
                <td>{shortId(row.voucher)}</td>
                <td style={{ color: 'var(--c-amber)' }}>{formatSui(row.stake_amount)}</td>
                <td style={{ textAlign: 'right', color: row.redeemed ? 'var(--c-mid)' : 'var(--c-green)' }}>
                  {row.redeemed ? 'REDEEMED' : 'ACTIVE'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="c-view__title" style={{ marginBottom: 10, marginTop: 24 }}>Vouches You've Given</div>
      {accountConnected && !feedLoading && givenVouches.length === 0 && (
        <div className="c-sub">No vouches issued by this wallet.</div>
      )}
      {givenVouches.length > 0 && (
        <table className="c-table">
          <thead><tr><th>Vouch ID</th><th>To (vouchee)</th><th>Stake</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
          <tbody>
            {givenVouches.map(row => (
              <tr key={row.vouch_id} style={{ opacity: row.redeemed ? 0.45 : 1 }}>
                <td><div style={{ fontSize: 12 }}>{shortId(row.vouch_id)}</div><div className="c-sub">{row.created_at}</div></td>
                <td>{shortId(row.vouchee)}</td>
                <td style={{ color: 'var(--c-amber)' }}>{formatSui(row.stake_amount)}</td>
                <td style={{ textAlign: 'right', color: row.redeemed ? 'var(--c-mid)' : 'var(--c-green)' }}>
                  {row.redeemed ? 'REDEEMED' : 'ACTIVE'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
