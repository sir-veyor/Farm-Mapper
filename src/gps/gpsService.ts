import { create } from 'zustand';
import { getSettings } from '../db/settingsRepo';
import type { Sample } from './averaging';

export type GpsStatus = 'off' | 'acquiring' | 'ok' | 'denied' | 'unavailable' | 'timeout';
export interface Fix {
  lon: number; lat: number; accuracyM: number; altitudeM: number | null; altitudeAccuracyM: number | null; time: number;
  headingDeg: number | null; // GPS course over ground, true north (only meaningful while moving)
  speedMps: number | null;
}

export const useGps = create<{ status: GpsStatus; last: Fix | null }>(() => ({ status: 'off', last: null }));

let watchId: number | undefined;
let refs = 0;
const listeners = new Set<(f: Fix) => void>();

function onPos(p: GeolocationPosition) {
  const fix: Fix = {
    lon: p.coords.longitude, lat: p.coords.latitude, accuracyM: p.coords.accuracy,
    altitudeM: p.coords.altitude, altitudeAccuracyM: p.coords.altitudeAccuracy, time: p.timestamp || Date.now(),
    headingDeg: p.coords.heading != null && Number.isFinite(p.coords.heading) ? p.coords.heading : null,
    speedMps: p.coords.speed != null && Number.isFinite(p.coords.speed) ? p.coords.speed : null,
  };
  useGps.setState({ status: 'ok', last: fix });
  listeners.forEach((l) => l(fix));
}

function onErr(e: GeolocationPositionError) {
  if (e.code === 1) { // permission denied: stop the watch, the user must change the setting
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    watchId = undefined;
    useGps.setState({ status: 'denied' });
  } else useGps.setState({ status: e.code === 3 ? 'timeout' : 'unavailable' }); // the watch keeps retrying
}

/** Reference-counted: the first caller starts the OS watch, the last stop ends it. */
export async function startWatch(): Promise<void> {
  refs++;
  if (watchId !== undefined) return;
  if (!navigator.geolocation) { useGps.setState({ status: 'unavailable' }); return; }
  const { gps } = await getSettings();
  if (watchId !== undefined || refs === 0) return;
  useGps.setState({ status: 'acquiring' });
  watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: gps.timeoutS * 1000 });
}

export function stopWatch(): void {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && watchId !== undefined) {
    navigator.geolocation.clearWatch(watchId);
    watchId = undefined;
    useGps.setState({ status: 'off' });
  }
}

/** Subscribe to every new fix (needs an active watch). Returns the unsubscribe function. */
export function onFix(cb: (f: Fix) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Latest fix if fresher than maxAgeMs, otherwise waits for the next one. Requires an active watch. */
export function getFix(maxAgeMs: number, timeoutMs: number): Promise<Fix> {
  const { last } = useGps.getState();
  if (last && Date.now() - last.time < maxAgeMs) return Promise.resolve(last);
  return new Promise((resolve, reject) => {
    const done = (f: Fix) => { clearTimeout(t); listeners.delete(done); resolve(f); };
    const t = setTimeout(() => {
      listeners.delete(done);
      const s = useGps.getState().status;
      reject(new Error(s === 'denied' ? 'Location permission is denied.' : 'No GPS fix yet. Move to open sky and try again.'));
    }, timeoutMs);
    listeners.add(done);
  });
}

/** Collects every fix for `seconds`. Rejects with AbortError if the signal fires. */
export function collectSamples(seconds: number, onSample: (all: Sample[]) => void, signal: AbortSignal): Promise<Sample[]> {
  return new Promise((resolve, reject) => {
    const samples: Sample[] = [];
    const add = (f: Fix) => { samples.push({ lon: f.lon, lat: f.lat, accuracyM: f.accuracyM, time: f.time }); onSample([...samples]); };
    const cleanup = () => { clearTimeout(t); listeners.delete(add); signal.removeEventListener('abort', abort); };
    const t = setTimeout(() => { cleanup(); resolve(samples); }, seconds * 1000);
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    listeners.add(add);
    signal.addEventListener('abort', abort);
    const { last } = useGps.getState();
    if (last && Date.now() - last.time < 1500) add(last);
  });
}

export async function withWakeLock<T>(fn: () => Promise<T>): Promise<T> {
  let lock: { release(): Promise<void> } | undefined;
  try { lock = await (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen'); }
  catch { /* unsupported or denied: carry on without it */ }
  try { return await fn(); } finally { void lock?.release().catch(() => undefined); }
}
