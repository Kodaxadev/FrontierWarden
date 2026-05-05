import { useCallback, useEffect, useState } from 'react';
import { fetchEveIdentity, fetchGivenVouches, fetchOracles, fetchProfileByOwner, fetchVouches } from '../../../../lib/api';
import type { EveIdentity, OracleRow, ProfileRow, VouchRow } from '../../../../types/api.types';
import { normalizeSuiAddress } from '../../../../lib/format';
import { useLendingActions } from '../../../../hooks/useLendingActions';
import { useOracleRegister } from '../../../../hooks/useOracleRegister';
import { useProfileCreate } from '../../../../hooks/useProfileCreate';
import { useVouchActions } from '../../../../hooks/useVouchActions';
import { ORACLE_MIN_STAKE_MIST, SYSTEM_MIN_STAKE_MIST } from '../../../../lib/tx-oracle-register';
import type { Provenance } from '../LiveStatus';
import { LiveStatus } from '../LiveStatus';
import { WalletStandingIssuerPanel } from '../WalletStandingIssuerPanel';
import { SocialIdentityPanel } from './SocialIdentityPanel';
import { SocialLoanPanel } from './SocialLoanPanel';
import { SocialOraclePanel } from './SocialOraclePanel';
import { SocialProfilePanel } from './SocialProfilePanel';
import { SocialVouchFeeds } from './SocialVouchFeeds';
import { SocialVouchPanel } from './SocialVouchPanel';
import { ORACLE_REGISTRY_ADMIN, shortId } from './social-utils';

interface SocialViewProps {
  provenance?: Provenance;
}

export function SocialView({ provenance }: SocialViewProps = {}) {
  const { account, createProfile, state: profState, reset: profReset } = useProfileCreate();
  const { createVouch, redeemVouch, state: vouchState, reset: vouchReset } = useVouchActions();
  const { repayLoan, markDefault, state: lendState, reset: lendReset } = useLendingActions();
  const { registerOracle, state: oracleState, reset: oracleReset } = useOracleRegister();

  const [profileId, setProfileId] = useState('');
  const [vouchee, setVouchee] = useState('');
  const [vouchStake, setVouchStake] = useState(1_000_000_000);
  const [vouchObjId, setVouchObjId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [repaymentMist, setRepaymentMist] = useState(1_000_000_000);
  const [markLoanId, setMarkLoanId] = useState('');
  const [oracleName, setOracleName] = useState('EVE Vault Oracle');
  const [oracleSchemas, setOracleSchemas] = useState('TRIBE_STANDING');
  const [isSystemOracle, setIsSystemOracle] = useState(false);
  const [teeVerified, setTeeVerified] = useState(false);
  const [teeHash, setTeeHash] = useState('none');
  const [existingOracle, setExistingOracle] = useState<OracleRow | null>(null);
  const [oracleCheckLoading, setOracleCheckLoading] = useState(false);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [profileLookup, setProfileLookup] = useState(false);
  const [eveIdentity, setEveIdentity] = useState<EveIdentity | null>(null);
  const [eveIdentityLoading, setEveIdentityLoading] = useState(false);
  const [receivedVouches, setReceivedVouches] = useState<VouchRow[]>([]);
  const [givenVouches, setGivenVouches] = useState<VouchRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const accountConnected = !!account;
  const canRegisterSystem = account?.address.toLowerCase() === ORACLE_REGISTRY_ADMIN;
  const requestedSystemOracle = canRegisterSystem && isSystemOracle;
  const minStake = requestedSystemOracle ? SYSTEM_MIN_STAKE_MIST : ORACLE_MIN_STAKE_MIST;
  const busy = profState.step === 'signing' || vouchState.step === 'signing'
    || lendState.step === 'signing' || oracleState.step === 'signing';

  useEffect(() => {
    if (!account) { setEveIdentity(null); return; }
    setEveIdentityLoading(true);
    fetchEveIdentity(account.address)
      .then((id) => setEveIdentity(id))
      .catch(() => setEveIdentity(null))
      .finally(() => setEveIdentityLoading(false));
  }, [account]);

  const lookupProfile = useCallback(async () => {
    if (!account) return;
    setProfileLookup(true);
    const normalized = normalizeSuiAddress(account.address);
    console.log('[SocialView] profile lookup - wallet:', account.address, 'normalized:', normalized);
    try {
      const p = await fetchProfileByOwner(normalized);
      console.log('[SocialView] profile lookup result:', p);
      setMyProfile(p);
      if (p) setProfileId(p.profile_id);
    } catch (err) {
      console.warn('[SocialView] profile lookup failed:', err);
    } finally {
      setProfileLookup(false);
    }
  }, [account]);

  useEffect(() => { void lookupProfile(); }, [lookupProfile]);

  useEffect(() => {
    if (profState.step !== 'done' || !account) return;
    let attempts = 0;
    const maxAttempts = 10;
    const timer = window.setInterval(() => {
      attempts++;
      void (async () => {
        try {
          const p = await fetchProfileByOwner(normalizeSuiAddress(account.address));
          if (p) {
            setMyProfile(p);
            setProfileId(p.profile_id);
            window.clearInterval(timer);
          } else if (attempts >= maxAttempts) {
            window.clearInterval(timer);
          }
        } catch { /* keep polling */ }
      })();
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [profState.step, profState.digest, account]);

  useEffect(() => {
    if (!account) { setExistingOracle(null); return; }
    setOracleCheckLoading(true);
    const normalized = normalizeSuiAddress(account.address);
    fetchOracles(200)
      .then(rows => {
        const match = rows.find(r => normalizeSuiAddress(r.oracle_address) === normalized);
        setExistingOracle(match ?? null);
      })
      .catch(() => setExistingOracle(null))
      .finally(() => setOracleCheckLoading(false));
  }, [account]);

  const loadVouches = useCallback(async () => {
    if (!account) return;
    setFeedLoading(true);
    try {
      const [received, given] = await Promise.all([
        fetchVouches(account.address, 20),
        fetchGivenVouches(account.address, 20),
      ]);
      setReceivedVouches(received);
      setGivenVouches(given);
    } catch { /* silent */ }
    finally { setFeedLoading(false); }
  }, [account]);

  useEffect(() => { void loadVouches(); }, [loadVouches]);

  return (
    <>
      <div className="c-view__title">Social &amp; Protocol Actions</div>
      <LiveStatus loading={false} live={accountConnected} provenance={provenance} liveText={account ? `Wallet ${shortId(account.address)}` : 'No wallet connected'} emptyText="Connect a wallet to sign transactions" />

      <SocialIdentityPanel accountAddress={account?.address} eveIdentity={eveIdentity} loading={eveIdentityLoading} />
      <SocialProfilePanel
        accountConnected={accountConnected}
        busy={busy}
        myProfile={myProfile}
        profileLookup={profileLookup}
        profState={profState}
        onCreateProfile={() => void createProfile()}
        onLookupProfile={() => void lookupProfile()}
        onReset={profReset}
      />
      <SocialVouchPanel
        accountConnected={accountConnected}
        busy={busy}
        profileId={profileId}
        vouchee={vouchee}
        vouchStake={vouchStake}
        vouchObjId={vouchObjId}
        vouchState={vouchState}
        setProfileId={setProfileId}
        setVouchee={setVouchee}
        setVouchStake={setVouchStake}
        setVouchObjId={setVouchObjId}
        onCreateVouch={() => void createVouch({ voucherProfileId: profileId, voucheeAddress: vouchee, stakeMist: BigInt(vouchStake) })}
        onRedeemVouch={() => void redeemVouch({ vouchId: vouchObjId })}
        onReset={vouchReset}
      />
      <SocialLoanPanel
        accountConnected={accountConnected}
        busy={busy}
        loanId={loanId}
        repaymentMist={repaymentMist}
        markLoanId={markLoanId}
        lendState={lendState}
        setLoanId={setLoanId}
        setRepaymentMist={setRepaymentMist}
        setMarkLoanId={setMarkLoanId}
        onRepayLoan={() => void repayLoan({ loanId, repaymentMist: BigInt(repaymentMist) })}
        onMarkDefault={() => void markDefault({ loanId: markLoanId })}
        onReset={lendReset}
      />
      <SocialOraclePanel
        accountConnected={accountConnected}
        busy={busy}
        existingOracle={existingOracle}
        oracleCheckLoading={oracleCheckLoading}
        oracleName={oracleName}
        oracleSchemas={oracleSchemas}
        requestedSystemOracle={requestedSystemOracle}
        canRegisterSystem={canRegisterSystem}
        teeVerified={teeVerified}
        teeHash={teeHash}
        oracleState={oracleState}
        setOracleName={setOracleName}
        setOracleSchemas={setOracleSchemas}
        setIsSystemOracle={setIsSystemOracle}
        setTeeVerified={setTeeVerified}
        setTeeHash={setTeeHash}
        onRegisterOracle={() => void registerOracle({
          name: oracleName.trim(),
          initialSchemas: oracleSchemas.split(',').map(s => s.trim()).filter(Boolean),
          stakeMist: minStake,
          teeVerified,
          teeAttestationHash: teeHash || 'none',
          isSystemOracle: requestedSystemOracle,
        })}
        onReset={oracleReset}
      />

      <WalletStandingIssuerPanel />
      <SocialVouchFeeds
        accountConnected={accountConnected}
        feedLoading={feedLoading}
        receivedVouches={receivedVouches}
        givenVouches={givenVouches}
      />
    </>
  );
}
