import { ThemeProvider, ToastProvider } from '@dcos/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { UpgradeGate } from './components/UpgradeRecovery';
import { protectExistingData } from './lib/storage';
import './index.css';

// If this device already holds work, ask the browser to keep it (audit H-1 / incident S-1).
void protectExistingData();

// The gate comes first: if the safety copy before a database update cannot be made, the recovery screen
// is shown instead of the app (audit STOR-R5).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <UpgradeGate>
          <App />
        </UpgradeGate>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
