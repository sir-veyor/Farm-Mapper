import { create } from 'zustand';
import { compassHeading, smoothAngle } from './compass';

export type CompassStatus = 'off' | 'starting' | 'ok' | 'denied' | 'unavailable';
export const useCompass = create<{ status: CompassStatus; headingMag: number | null }>(() => ({ status: 'off', headingMag: null }));

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
let refs = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let smoothed: number | null = null;

function onOrientation(e: Event) {
  const ev = e as OrientationEvent;
  let mag: number | null = null;
  if (typeof ev.webkitCompassHeading === 'number') mag = ev.webkitCompassHeading;          // iOS: already clockwise from magnetic north
  else if (ev.absolute && ev.alpha !== null && ev.beta !== null && ev.gamma !== null) mag = compassHeading(ev.alpha, ev.beta, ev.gamma); // Android
  if (mag === null || !Number.isFinite(mag)) return;
  clearTimeout(timer);
  smoothed = smoothAngle(smoothed, mag, 0.2);
  useCompass.setState({ status: 'ok', headingMag: smoothed });
}

/**
 * Starts the compass. On iPhone this must run inside a tap handler (the OS asks permission).
 * Reference-counted: the last stopCompass() removes the listeners.
 */
export async function startCompass(): Promise<void> {
  refs++;
  if (refs > 1) return;
  const DOE = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as
    (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }) | undefined;
  if (!DOE) { useCompass.setState({ status: 'unavailable', headingMag: null }); return; }
  useCompass.setState({ status: 'starting' });
  if (typeof DOE.requestPermission === 'function') {
    try {
      if ((await DOE.requestPermission()) !== 'granted') { useCompass.setState({ status: 'denied' }); return; }
    } catch { useCompass.setState({ status: 'denied' }); return; }
  }
  smoothed = null;
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener, true);
  window.addEventListener('deviceorientation', onOrientation as EventListener, true);
  timer = setTimeout(() => { if (useCompass.getState().status === 'starting') useCompass.setState({ status: 'unavailable' }); }, 3000);
}

export function stopCompass(): void {
  refs = Math.max(0, refs - 1);
  if (refs > 0) return;
  clearTimeout(timer);
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener, true);
  window.removeEventListener('deviceorientation', onOrientation as EventListener, true);
  useCompass.setState({ status: 'off', headingMag: null });
  smoothed = null;
}
