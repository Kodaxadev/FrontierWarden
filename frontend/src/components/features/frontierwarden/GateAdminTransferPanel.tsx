import { useTransferGateAdminCap } from '../../../hooks/useTransferGateAdminCap';

interface Props {
  currentOwner: string;
}

const EVE_TARGET =
  import.meta.env.VITE_GATE_ADMIN_TRANSFER_TARGET
  ?? import.meta.env.VITE_ORACLE_ADDRESS
  ?? '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';

const shortId = (value: string) =>
  value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;

export function GateAdminTransferPanel({ currentOwner }: Props) {
  const { account, reset, state, transfer } = useTransferGateAdminCap();
  const connectedOwner = account?.address.toLowerCase() === currentOwner.toLowerCase();
  const alreadyTarget = currentOwner.toLowerCase() === EVE_TARGET.toLowerCase();
  const busy = ['building', 'sponsoring', 'signing', 'executing'].includes(state.step);

  if (alreadyTarget) return null;

  const statusColor = state.step === 'error'
    ? 'var(--c-crimson)'
    : state.step === 'done'
      ? 'var(--c-green)'
      : 'var(--c-mid)';

  return (
    <div style={{
      maxWidth: 900,
      marginBottom: 28,
      padding: 20,
      border: '1px solid rgba(255,170,0,0.36)',
      background: 'rgba(255,170,0,0.025)',
    }}>
      <div className="c-stat__label" style={{ marginBottom: 14 }}>Gate Admin Migration</div>
      <div className="c-kv">
        <span className="c-kv__k">Current Owner</span>
        <span className="c-kv__v">{currentOwner}</span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Target EVE Vault</span>
        <span className="c-kv__v">{EVE_TARGET}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
        <button
          className="c-commit"
          disabled={!connectedOwner || busy}
          title={connectedOwner ? 'Transfer GateAdminCap to EVE Vault' : `Connect ${shortId(currentOwner)}`}
          onClick={() => state.step === 'done' || state.step === 'error' ? reset() : void transfer(EVE_TARGET)}
        >
          {busy ? state.step.toUpperCase() : state.step === 'done' ? 'CLEAR' : 'TRANSFER ADMIN CAP'}
        </button>
        <span style={{ color: statusColor, fontSize: 10 }}>
          {state.step === 'done' && state.digest
            ? `transferred · tx ${shortId(state.digest)}`
            : state.step === 'error'
              ? state.error
              : connectedOwner
                ? 'Ready: wallet signs ownership transfer, sponsor pays gas'
                : 'Connect the current owner wallet to transfer admin control'}
        </span>
      </div>
    </div>
  );
}
