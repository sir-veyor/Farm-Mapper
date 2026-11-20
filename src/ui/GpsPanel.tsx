import { useEffect, useRef, useState } from 'react';
import { getSettings, patchSettings } from '../db/settingsRepo';
import type { Sample } from '../gps/averaging';
import { startWatch, stopWatch, useGps } from '../gps/gpsService';
import { pinAveraged, pinHere } from '../gps/pinService';
import { act, useUi } from '../state/uiStore';
import { formatDistance } from '../util/geo';
import { Sheet } from './Sheet';
import { btn, btnOn } from './styles';
import { useLive } from './useLive';

const MESSAGES: Record<string, string> = {
  off: 'GPS off', acquiring: 'Looking for a satellite fix...', ok: 'GPS OK',
  denied: 'Location permission denied. On iPhone: Settings > Privacy > Location Services > Safari Websites (or the installed app) > While Using. On Android: site settings > Location > Allow.',
  unavailable: 'No position available. Move to open sky.', timeout: 'Fix is taking a while. Keep the screen on and move to open sky.',
};

const accColor = (m: number) => (m <= 5 ? '#2f9e44' : m <= 15 ? '#f08c00' : '#e03131');

export function GpsPanel() {
  const { status, last } = useGps();
  const setPanel = useUi((s) => s.setPanel);
  const follow = useUi((s) => s.follow);
  const setFollow = useUi((s) => s.setFollow);
  const select = useUi((s) => s.select);
  const settings = useLive(getSettings, ['settings']);
  const [, tick] = useState(0);
  const [avg, setAvg] = useState<{ n: number; elapsed: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void startWatch();
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => { clearInterval(t); abort.current?.abort(); stopWatch(); };
  }, []);

  const units = settings?.units ?? 'metric';
  const secs = settings?.gps.averageSeconds ?? 30;
  const age = last ? Math.max(0, Math.round((Date.now() - last.time) / 1000)) : null;

  async function pin() {
    setBusy(true);
    const poi = await act(pinHere());
    setBusy(false);
    if (poi) select({ kind: 'poi', id: poi.id });
  }

  async function pinAvg() {
    const ac = new AbortController();
    abort.current = ac;
    const t0 = Date.now();
    setBusy(true); setAvg({ n: 0, elapsed: 0, total: secs });
    const timer = setInterval(() => setAvg((a) => a && { ...a, elapsed: Math.round((Date.now() - t0) / 1000) }), 500);
    try {
      const poi = await pinAveraged(secs, (s: Sample[]) => setAvg((a) => a && { ...a, n: s.length }), ac.signal);
      select({ kind: 'poi', id: poi.id });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') useUi.getState().toast((e as Error).message, 'error');
    } finally { clearInterval(timer); setAvg(null); setBusy(false); abort.current = null; }
  }

  return (
    <Sheet title="Pin my location" onClose={() => setPanel(null)}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {last ? (
          <>
            <span style={{ fontSize: 22, fontWeight: 700, color: accColor(last.accuracyM) }} data-testid="gps-accuracy">±{formatDistance(last.accuracyM, units)}</span>
            <span style={{ color: '#555' }}>{age}s ago · {last.lat.toFixed(6)}, {last.lon.toFixed(6)}</span>
          </>
        ) : <span>{MESSAGES[status]}</span>}
      </div>
      {last && status !== 'ok' && <div style={{ color: '#a35', marginTop: 4 }}>{MESSAGES[status]}</div>}
      {status === 'denied' && <div style={{ color: '#b42318', marginTop: 4 }}>{MESSAGES.denied}</div>}
      <div style={{ font: '12px system-ui', color: '#666', margin: '4px 0 8px' }}>Under canopy, use the average pin and keep the phone still with the screen on.</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btnOn} disabled={busy} onClick={() => void pin()}>📍 Pin here</button>
        <button style={btnOn} disabled={busy} onClick={() => void pinAvg()}>Pin (average {secs}s)</button>
        <select aria-label="Averaging time" value={secs} disabled={busy} style={btn}
          onChange={(e) => void patchSettings({ gps: { ...settings!.gps, averageSeconds: Number(e.target.value) as 5 | 10 | 30 | 60 } })}>
          {[5, 10, 30, 60].map((s) => <option key={s} value={s}>{s}s</option>)}
        </select>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow me
        </label>
      </div>
      {avg && (
        <div style={{ marginTop: 8 }} data-testid="avg-progress">
          <progress value={avg.elapsed} max={avg.total} style={{ width: '100%' }} />
          <div>{avg.elapsed}s / {avg.total}s · {avg.n} fixes. Keep the screen on and stand still.</div>
          <button style={btn} onClick={() => abort.current?.abort()}>Cancel</button>
        </div>
      )}
    </Sheet>
  );
}
