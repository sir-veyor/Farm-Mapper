import { getFix, startWatch, stopWatch } from '../gps/gpsService';
import { useMeasure } from '../state/measureStore';
import { act, useUi } from '../state/uiStore';
import { bearingDeg, cardinal, formatDistance, metersBetween } from '../util/geo';
import { btn } from './styles';

export function MeasureBanner() {
  const tool = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);
  const { points, undo, clear, add } = useMeasure();
  if (tool.type !== 'measure') return null;

  const legs = points.slice(1).map((p, i) => metersBetween(points[i], p));
  const total = legs.reduce((a, b) => a + b, 0);
  const last = legs.length ? legs[legs.length - 1] : null;
  const brg = points.length >= 2 ? bearingDeg(points[points.length - 2], points[points.length - 1]) : null;

  async function fromMyLocation() {
    await startWatch();
    try { const f = await act(getFix(5000, 15000)); if (f) add([f.lon, f.lat]); } finally { stopWatch(); }
  }
  const done = () => { clear(); setTool({ type: 'none' }); };

  return (
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 25, width: 'min(420px, 94%)', background: '#1c1c1c', color: '#fff',
      padding: '8px 12px', borderRadius: 12, font: '14px system-ui', boxShadow: '0 2px 8px rgba(0,0,0,.45)' }} data-testid="measure-banner">
      {points.length < 2 ? (
        <div>{points.length === 0 ? 'Measure: tap the first point.' : 'Tap the second point.'} <span style={{ color: '#bbb' }}>(Taps near a pin snap to it.)</span></div>
      ) : (
        <div>
          <span style={{ fontSize: 24, fontWeight: 700 }} data-testid="measure-distance">{formatDistance(legs.length === 1 ? legs[0] : total)}</span>
          <span style={{ color: '#ddd' }}> {legs.length === 1 ? '' : 'total '}· {cardinal(brg!)} {Math.round(brg!).toString().padStart(3, '0')}°</span>
          {legs.length > 1 && <div style={{ color: '#ccc' }}>Last leg {formatDistance(last!)} · {legs.length} legs. Tap to keep going.</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => void fromMyLocation()}>Add my location</button>
        <button style={btn} onClick={undo} disabled={!points.length}>Undo</button>
        <button style={btn} onClick={clear} disabled={!points.length}>Clear</button>
        <button style={btn} onClick={done}>Done</button>
      </div>
    </div>
  );
}
