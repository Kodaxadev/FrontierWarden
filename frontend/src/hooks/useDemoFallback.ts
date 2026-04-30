// useDemoFallback — global toggle for demo fallback data.
// When ON (default for local dev), views show FW_DATA fixtures when live data is empty.
// When OFF, views show empty state instead of falling back to mock data.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'fw-demo-fallback';

function readDefault(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored != null) return stored === 'true';
  } catch {
    // localStorage unavailable
  }
  // Default ON for localhost / dev, OFF for production
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export interface UseDemoFallbackState {
  demoEnabled: boolean;
  setDemoEnabled: (value: boolean) => void;
  toggleDemo: () => void;
}

export function useDemoFallback(): UseDemoFallbackState {
  const [demoEnabled, setDemoEnabled] = useState(readDefault);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(demoEnabled));
    } catch {
      // localStorage unavailable
    }
  }, [demoEnabled]);

  const toggleDemo = useCallback(() => {
    setDemoEnabled(prev => !prev);
  }, []);

  return { demoEnabled, setDemoEnabled, toggleDemo };
}
