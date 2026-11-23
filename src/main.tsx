import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { seedBundledVectors } from './data/seedBundledVectors';
import { ensureSeed } from './db/seed';
import { noteInterruptedTrack } from './track/trackService';
import { App } from './ui/App';

async function boot() {
  try { await navigator.storage?.persist?.(); } catch { /* not supported: ignore */ }
  await ensureSeed();
  await seedBundledVectors(); // only the empty Tracking layer: this public app carries no map data
  registerSW({ immediate: true });
  void noteInterruptedTrack();
  if (new URLSearchParams(location.search).has('debugTiles')) { // test hook
    const [{ useTrack }, { useGps }, { useCompass }] = await Promise.all([import('./track/trackService'), import('./gps/gpsService'), import('./nav/compassService')]);
    const trackMod = await import('./track/trackService');
    (window as unknown as Record<string, unknown>).__stores = { useTrack, useGps, useCompass, debug: trackMod._debugState };
  }
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
void boot();
