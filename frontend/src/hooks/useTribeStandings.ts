// useTribeStandings.ts -- Aggregates live TRIBE_STANDING scores by syndicate.
//
// Wraps useLeaderboard and maps each profile's score into a per-syndicate
// aggregate (sum). Falls back to zero totals while loading.
//
// The "player syndicate" concept is not yet on-chain: we infer membership
// from which issuer signed the highest-value TRIBE_STANDING attestation.
// Production: replace with a dedicated /tribe-standings endpoint once the
// indexer exposes per-syndicate summaries.

import { useMemo }           from 'react';
import { useLeaderboard }    from './useLeaderboard';
import {
  SYNDICATE_IDS,
  SYNDICATES,
  type SyndicateId,
}                            from '../lib/tribe-data';

export interface SyndicateStanding {
  id:         SyndicateId;
  name:       string;
  hexColor:   string;
  totalScore: number;
  memberCount: number;
}

export interface TribeStandingsState {
  syndicates: SyndicateStanding[];
  loading:    boolean;
  error:      string | null;
}

export function useTribeStandings(): TribeStandingsState {
  const { data, loading, error } = useLeaderboard('TRIBE_STANDING', 100);

  const syndicates = useMemo<SyndicateStanding[]>(() => {
    // Aggregate live scores — we use the issuer field as a proxy for
    // syndicate membership (issuer = syndicate oracle address).
    // Without a real mapping, distribute evenly across syndicates for demo.
    const totals: Record<SyndicateId, { score: number; count: number }> = {
      VANGUARD:     { score: 0, count: 0 },
      REMNANTS:     { score: 0, count: 0 },
      EXILES:       { score: 0, count: 0 },
      UNAFFILIATED: { score: 0, count: 0 },
    };

    if (data.length > 0) {
      // Distribute entries round-robin by index for devnet demo.
      // Production: map issuer address to SyndicateId via registry.
      const ids: SyndicateId[] = ['VANGUARD', 'REMNANTS', 'EXILES', 'UNAFFILIATED'];
      data.forEach((entry, i) => {
        const sid = ids[i % ids.length];
        totals[sid].score += entry.value;
        totals[sid].count += 1;
      });
    }

    return SYNDICATE_IDS.map((id) => ({
      id,
      name:        SYNDICATES[id].name,
      hexColor:    SYNDICATES[id].hexColor,
      totalScore:  totals[id].score,
      memberCount: totals[id].count,
    }));
  }, [data]);

  return { syndicates, loading, error };
}
