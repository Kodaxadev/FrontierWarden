import type { FwData } from '../components/features/frontierwarden/fw-data';
import type { EveIdentity, IdentityEnrichmentMap } from '../types/api.types';
import type { CharacterTrustProfile, WalletTrustProfile } from '../types/node-sentinel.types';

export function deriveCharacters(
  data: FwData,
  identity?: EveIdentity | null,
  identityMap: IdentityEnrichmentMap = {},
): CharacterTrustProfile[] {
  const profiles: CharacterTrustProfile[] = [];

  if (identity) {
    profiles.push({
      wallet: identity.wallet,
      characterId: identity.character_id,
      characterName: identity.character_name,
      tribeId: identity.tribe_id,
      tribeName: identity.tribe_name,
      profileId: identity.frontierwarden_profile_id,
      score: data.pilot.score,
      schemaId: data.pilot.standing,
      attestationCount: data.proofs.filter(p => !p.revoked).length,
      hasCharacterMapping: !!identity.character_id,
      lastSeen: identity.synced_at ?? undefined,
    });
  }

  for (const vouch of data.vouches) {
    const wallet = vouch.voucherWallet ?? vouch.by;
    const enrichment = identityMap[wallet];
    profiles.push({
      wallet,
      characterId: enrichment?.character_id,
      characterName: enrichment?.character_name,
      tribeId: enrichment?.tribe_id,
      tribeName: enrichment?.tribe_name,
      profileId: enrichment?.frontierwarden_profile_id,
      score: Math.round(vouch.weight * 1000),
      attestationCount: 0,
      hasCharacterMapping: !!enrichment?.character_id,
      lastSeen: enrichment?.synced_at ?? vouch.ts,
    });
  }

  return profiles;
}

export function deriveWallets(
  data: FwData,
  identity?: EveIdentity | null,
  identityMap: IdentityEnrichmentMap = {},
): WalletTrustProfile[] {
  const wallets = new Map<string, WalletTrustProfile>();

  if (identity) {
    wallets.set(identity.wallet, {
      wallet: identity.wallet,
      identity,
      score: data.pilot.score,
      vouchCount: data.vouches.length,
      attestationCount: data.proofs.filter(p => !p.revoked).length,
      hasProfile: !!identity.frontierwarden_profile_id,
      hasCharacterMapping: !!identity.character_id,
      riskLevel: data.pilot.score > 500 ? 'low' : data.pilot.score > 200 ? 'medium' : 'high',
    });
  }

  for (const [wallet, enrichment] of Object.entries(identityMap)) {
    if (wallets.has(wallet)) continue;
    wallets.set(wallet, {
      wallet,
      identity: null,
      score: null,
      vouchCount: data.vouches.filter(v => v.voucherWallet === wallet || v.voucheeWallet === wallet).length,
      attestationCount: 0,
      hasProfile: !!enrichment.frontierwarden_profile_id,
      hasCharacterMapping: !!enrichment.character_id,
      riskLevel: enrichment.character_id ? 'unknown' : 'medium',
    });
  }

  return [...wallets.values()];
}

export function resolutionCoverage(wallets: WalletTrustProfile[]) {
  const total = wallets.length;
  const mapped = wallets.filter(w => w.hasCharacterMapping).length;
  return { total, mapped, unmapped: Math.max(0, total - mapped) };
}
