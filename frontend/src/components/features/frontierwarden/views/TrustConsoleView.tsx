import { useEffect, useState } from 'react';
import { evaluateTrust, fetchEveIdentity } from '../../../../lib/api';
import type { FwData } from '../fw-data';
import type { TrustEvaluateResponse, TrustAction } from '../../../../types/api.types';
import type { EveIdentity } from '../../../../types/api.types';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import { useProfileCreate } from '../../../../hooks/useProfileCreate';
import { TrustIdentityStrip } from './TrustIdentityStrip';
import { TrustInputPanel, TrustPresetStrip } from './TrustInputPanel';
import { TrustResultPanel } from './TrustResultPanel';
import { DEFAULT_GATE, DEFAULT_SUBJECT } from './trust-console-types';
import type { Preset } from './trust-console-types';

interface Props {
  data?: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
  provenance?: Provenance;
}

export function TrustConsoleView({ data, live = false, loading = false, error = null, provenance }: Props) {
  const { account } = useProfileCreate();
  const firstGate = data?.policy?.gateId ?? data?.gates[0]?.sourceId ?? DEFAULT_GATE;
  const [action, setAction] = useState<TrustAction>('gate_access');
  const [subject, setSubject] = useState(() => account?.address ?? DEFAULT_SUBJECT);
  const [gateId, setGateId] = useState(firstGate);
  const [schemaId, setSchemaId] = useState('TRIBE_STANDING');
  const [minimumScore, setMinimumScore] = useState(500);
  const [result, setResult] = useState<TrustEvaluateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [eveIdentity, setEveIdentity] = useState<EveIdentity | null>(null);
  const [eveIdentityLoading, setEveIdentityLoading] = useState(false);

  useEffect(() => {
    const addr = subject.trim();
    if (!addr || addr.length < 64) { setEveIdentity(null); setEveIdentityLoading(false); return; }
    setEveIdentityLoading(true);
    fetchEveIdentity(addr)
      .then(setEveIdentity)
      .catch(() => setEveIdentity(null))
      .finally(() => setEveIdentityLoading(false));
  }, [subject]);

  const runEvaluation = async () => {
    setBusy(true);
    setEvalError(null);
    try {
      const next = await evaluateTrust({
        entity: subject.trim(),
        action,
        context: {
          gateId: action === 'gate_access' ? gateId.trim() : undefined,
          schemaId: schemaId.trim() || undefined,
          minimumScore: (action === 'counterparty_risk' || action === 'bounty_trust') ? minimumScore : undefined,
        },
      });
      setResult(next);
    } catch (err) {
      setResult(null);
      setEvalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    setAction(preset.action);
    setSubject(preset.subject);
    if (preset.gateId) setGateId(preset.gateId);
    setSchemaId(preset.schemaId);
    if (preset.minimumScore != null) setMinimumScore(preset.minimumScore);
    setResult(null);
    setEvalError(null);
  };

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  };

  return (
    <>
      <div className="c-view__title">Trust Decision Console</div>
      <div className="c-sub" style={{ marginTop: -16, marginBottom: 24 }}>
        Evaluate gate access, counterparty risk, or bounty trust from indexed Sui testnet proof.
      </div>
      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        provenance={provenance}
        liveText="Trust API connected"
        emptyText="Trust API unavailable"
      />

      <TrustIdentityStrip eveIdentity={eveIdentity} loading={eveIdentityLoading} />

      <TrustPresetStrip onApplyPreset={applyPreset} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        gap: 32,
        alignItems: 'start',
      }}>
        <div>
          <TrustInputPanel
            action={action}
            subject={subject}
            gateId={gateId}
            schemaId={schemaId}
            minimumScore={minimumScore}
            busy={busy}
            evalError={evalError}
            setAction={setAction}
            setSubject={setSubject}
            setGateId={setGateId}
            setSchemaId={setSchemaId}
            setMinimumScore={setMinimumScore}
            onEvaluate={runEvaluation}
          />
        </div>
        <TrustResultPanel
          result={result}
          copied={copied}
          onCopyJson={copyJson}
        />
      </div>
    </>
  );
}
