// Application entry point.
// Provider hierarchy: QueryClientProvider -> DAppKitProvider -> VaultProvider
//   -> NotificationProvider
// Note: EveFrontierProvider/SmartObjectProvider are NOT used here because
// FrontierWarden doesn't require smart object context. If assembly-specific
// views are needed, wrap those routes with SmartObjectProvider conditionally
// (requires VITE_OBJECT_ID or ?itemId= query param).
// queryClient created here so hooks outside the provider tree can access it if needed.

import { StrictMode }          from 'react';
import { createRoot }          from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DAppKitProvider }      from '@mysten/dapp-kit-react';
import {
  NotificationProvider,
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
          <NotificationProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </NotificationProvider>
        </VaultProvider>
      </DAppKitProvider>
    </QueryClientProvider>
  </StrictMode>,
);
