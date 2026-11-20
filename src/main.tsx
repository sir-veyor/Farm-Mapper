import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { seedBundledVectors } from './data/seedBundledVectors';
import { ensureSeed } from './db/seed';
import { getMap } from './map/mapHandle';
import { seedBundledRasters } from './raster/bundledData';
import { useUi } from './state/uiStore';
import { App } from './ui/App';

async function boot() {
  try { await navigator.storage?.persist?.(); } catch { /* not supported: ignore */ }
  await ensureSeed();
  await seedBundledVectors(); // boundary, trails and tree stands are inside the app, so this works with no network
  registerSW({ immediate: true });
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
  // Not awaited: the app is usable immediately; layers appear as each file finishes importing.
  void seedBundledRasters(useUi.getState().toast).then((added) => {
    if (added) getMap()?.fitBounds([[-77.4876, 42.3953], [-77.4652, 42.4065]], { padding: 40, maxZoom: 17, duration: 800 });
  });
}
void boot();
