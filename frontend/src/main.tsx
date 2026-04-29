// Application entry point.
// EveFrontierProvider nests: QueryClientProvider -> DAppKitProvider -> VaultProvider
//   -> SmartObjectProvider -> NotificationProvider
// queryClient created here so hooks outside the provider tree can access it if needed.

import { StrictMode }          from 'react';
import { createRoot }          from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DAppKitProvider }      from '@mysten/dapp-kit-react';
import {
  NotificationProvider,
  SmartObjectProvider,
  VaultProvider,
} from '@evefrontier/dapp-kit';
import './globals.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { dAppKit } from './lib/dapp-kit';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Polling hooks set their own refetchInterval -- staleTime 0 ensures
      // background refetches always fire rather than being skipped.
      staleTime: 0,
      retry: 2,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root not found -- check index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>
        <VaultProvider>
          <SmartObjectProvider>
            <NotificationProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </NotificationProvider>
          </SmartObjectProvider>
        </VaultProvider>
      </DAppKitProvider>
    </QueryClientProvider>
  </StrictMode>,
);
