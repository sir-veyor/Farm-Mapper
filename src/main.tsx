import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ensureSeed } from './db/seed';
import { App } from './ui/App';

async function boot() {
  try { await navigator.storage?.persist?.(); } catch { /* not supported: ignore */ }
  await ensureSeed();
  registerSW({ immediate: true });
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
void boot();
