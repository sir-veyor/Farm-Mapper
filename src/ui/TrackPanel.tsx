import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { startNavigation } from '../nav/navigation';
import { getMap } from '../map/mapHandle';
import { act, useUi } from '../state/uiStore';
import { SIGNS } from '../track/signs';
import { dropSign, pauseTrack, resumeCurrent, resumeTrack, startNewTrack, startOfTrack, stopTrack, useTrack } from '../track/trackService';
import { formatDuration } from '../track/trackMath';
import { formatDistance, geometryBounds, fitSafe } from '../util/geo';
import type { VectorFeature } from '../types';
import { Sheet } from './Sheet';
import { btn, btnDanger, btnOn, label } from './styles';
import { useLive } from './useLive';

export function TrackPanel() {
  const setPanel = useUi((s) => s.setPanel);
  const select = useUi((s) => s.select);
  const toast = useUi((s) => s.toast);
  const t = useTrack();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);

  const tracks = useLive(async () => {
    const layers = (await db.layers.toArray()).filter((l) => l.name === 'Tracking' && l.kind === 'vector').map((l) => l.id);
    const feats = (await db.features.toArray()).filter((f) => layers.includes(f.layerId) && f.source.kind === 'track');
    return feats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, ['features', 'layers'], []) ?? [];

  const elapsed = t.durationBeforeS + (t.sessionStartedAt ? (Date.now() - t.sessionStartedAt) / 1000 : 0);
  const active = t.status !== 'idle';

  const zoomTo = (f: VectorFeature) => {
    const b = geometryBounds(f.geometry); if (!b) return;
    const x = fitSafe(b);
    getMap()?.fitBounds([[x[0], x[1]], [x[2], x[3]]], { padding: 60, maxZoom: 19, duration: 600 });
  };
  const backToStart = (f: VectorFeature | undefined) => {
    const p = f ? startOfTrack(f) : null;
    if (!p) return toast('No track start to go back to yet.', 'info');
    startNavigation({ lon: p[0], lat: p[1], name: 'Start of track' });
    setPanel(null);
  };
  const current = t.featureId ? tracks.find((f) => f.id === t.featureId) : undefined;

  return (
    <Sheet title="Tracking" onClose={() => setPanel(null)}>
      {t.status === 'idle' ? (
        <div>
          <button style={btnOn} data-testid="track-start" onClick={() => void act(startNewTrack())}>● Start new track</button>
          <div style={{ font: '12px system-ui', color: '#666', margin: '6px 0' }}>
            Records where you walk, so you can see ground you have already covered. Keeps the screen on while recording (phones stop GPS when the screen is off). Saved automatically on the Tracking layer.
          </div>
        </div>
      ) : (
        <div data-testid="track-active">
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28, fontWeight: 700 }} data-testid="track-distance">{formatDistance(t.distanceM)}</span>
            <span style={{ fontSize: 18 }}>{formatDuration(elapsed)}</span>
            <span style={{ color: '#666' }}>{t.points} points</span>
            <span style={{ color: t.status === 'recording' ? '#e03131' : '#b25e00', fontWeight: 600 }}>{t.status === 'recording' ? '● recording' : '❚❚ paused'}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {t.status === 'recording'
              ? <button style={btn} data-testid="track-pause" onClick={() => void act(pauseTrack())}>❚❚ Pause</button>
              : <button style={btnOn} data-testid="track-resume" onClick={() => void act(resumeCurrent())}>▶ Resume</button>}
            <button style={btnDanger} data-testid="track-stop" onClick={() => void act(stopTrack())}>■ Stop and save</button>
            <button style={btn} onClick={() => backToStart(current)} disabled={!current}>🧭 Back to start</button>
          </div>
        </div>
      )}

      <span style={label}>Mark sign at my position (drops on the Tracking layer)</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {SIGNS.map((s) => (
          <button key={s.key} style={btn} data-testid={`sign-${s.key}`}
            onClick={() => void act(async () => { const p = await dropSign(s); toast(`${p.name} marked (GPS ±${formatDistance(p.gps?.accuracyM ?? 0)}).`, 'success'); })}>{s.label}</button>
        ))}
      </div>

      <span style={label}>Saved tracks ({tracks.length})</span>
      {tracks.length === 0 && <div style={{ color: '#666' }}>None yet.</div>}
      {tracks.map((f) => {
        const src = f.source.kind === 'track' ? f.source : null;
        const isCurrent = f.id === t.featureId && active;
        return (
          <div key={f.id} style={{ borderTop: '1px solid #e5e5e5', padding: '6px 0' }} data-testid={`track-row-${f.name}`}>
            <div><b>{f.name}</b>{isCurrent && <span style={{ color: '#e03131' }}> (current)</span>}</div>
            <div style={{ font: '12px system-ui', color: '#666' }}>
              {src ? `${formatDistance(src.distanceM)} · ${formatDuration(src.durationS)}` : ''} · {new Date(f.createdAt).toLocaleDateString()}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <button style={btn} disabled={isCurrent} data-testid={`track-resume-${f.name}`} onClick={() => void act(resumeTrack(f.id))}>▶ Resume this</button>
              <button style={btn} onClick={() => zoomTo(f)}>Zoom to</button>
              <button style={btn} onClick={() => backToStart(f)}>🧭 Start</button>
              <button style={btn} onClick={() => select({ kind: 'feature', id: f.id })}>Rename / delete</button>
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}
