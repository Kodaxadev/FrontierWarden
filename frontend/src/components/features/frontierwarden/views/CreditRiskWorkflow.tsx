// CreditRiskWorkflow — "Review credit risk"
// Restructured for creditor persona: Portfolio | Lookup | Watchlist | Contracts | Social.
// P0: Counterparty Lookup, Loan Portfolio, Watchlist
// Existing: Contract Queue, Vouches & Lending (Social)

import { useState, useCallback } from 'react';
import { ContractsView } from './ContractsView';
import { SocialView } from './SocialView';
import { CounterpartyLookupView } from './CounterpartyLookupView';
import { WatchlistView } from './WatchlistView';
import { LoanPortfolioView } from './LoanPortfolioView';
import { WorkflowSubNav } from '../WorkflowSubNav';
import { useWatchlist } from '../../../../hooks/useWatchlist';
import { useLoanPortfolio } from '../../../../hooks/useLoanPortfolio';
import type { FwData } from '../fw-data';
import type { Provenance } from '../LiveStatus';

type SubTab = 'portfolio' | 'lookup' | 'watchlist' | 'contracts' | 'social';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  contractsLive: boolean;
  provenance: {
    contracts: Provenance;
    reputation: Provenance;
  };
}

export function CreditRiskWorkflow(props: Props) {
  const [sub, setSub] = useState<SubTab>('portfolio');
  const [lookupAddress, setLookupAddress] = useState<string | null>(null);
  const watchlist = useWatchlist();
  const portfolio = useLoanPortfolio();

  // Navigate to lookup with a pre-filled address (from watchlist "FULL DOSSIER")
  const navigateToLookup = useCallback((address: string) => {
    setLookupAddress(address);
    setSub('lookup');
  }, []);

  return (
    <div>
      <p className="c-section-header">Review credit risk</p>
      <WorkflowSubNav active={sub} onChange={setSub} tabs={[
        { id: 'portfolio',  label: 'Loan Portfolio' },
        { id: 'lookup',     label: 'Counterparty Lookup' },
        { id: 'watchlist',  label: `Watchlist (${watchlist.entries.length})` },
        { id: 'contracts',  label: 'Contract Queue' },
        { id: 'social',     label: 'Actions' },
      ]} />

      {sub === 'portfolio' && (
        <LoanPortfolioView
          loans={portfolio.loans}
          totalLent={portfolio.totalLent}
          totalRepaid={portfolio.totalRepaid}
          defaultCount={portfolio.defaultCount}
          defaultRate={portfolio.defaultRate}
          onAddLoan={portfolio.addLoan}
          onUpdateLoan={portfolio.updateLoan}
          onRemoveLoan={portfolio.removeLoan}
        />
      )}
      {sub === 'lookup' && (
        <CounterpartyLookupView
          onAddToWatchlist={watchlist.addEntry}
          isOnWatchlist={watchlist.hasAddress}
          key={lookupAddress}
        />
      )}
      {sub === 'watchlist' && (
        <WatchlistView
          entries={watchlist.entries}
          onRemove={watchlist.removeEntry}
          onUpdate={watchlist.updateEntry}
          onLookup={navigateToLookup}
        />
      )}
      {sub === 'contracts' && (
        <ContractsView
          data={props.data} live={props.contractsLive} loading={props.loading}
          error={props.error} provenance={props.provenance.contracts}
        />
      )}
      {sub === 'social' && (
        <SocialView provenance={props.provenance.reputation} />
      )}
    </div>
  );
}
