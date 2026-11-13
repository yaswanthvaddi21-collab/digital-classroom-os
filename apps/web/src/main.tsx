import { ThemeProvider, ToastProvider } from '@dcos/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { protectExistingData } from './lib/storage';
import './index.css';

// If this device already holds work, ask the browser to keep it (audit H-1 / incident S-1).
void protectExistingData();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
