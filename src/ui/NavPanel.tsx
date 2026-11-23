import { useEffect } from 'react';
import { MAGNETIC_DECLINATION_DEG } from '../config';
import { startWatch, stopWatch, useGps } from '../gps/gpsService';
import { arrowRotation, pickHeading } from '../nav/compass';
import { useCompass } from '../nav/compassService';
import { stopNavigation } from '../nav/navigation';
import { navigationInfo } from '../nav/navMath';
import { useUi } from '../state/uiStore';
import { cardinal, formatDistance } from '../util/geo';
import { btn } from './styles';

/** Floating "walk to this" card: distance in feet and an arrow that points at the target. */
export function NavPanel() {
  const nav = useUi((s) => s.nav);
  const { last, status } = useGps();
  const comp = useCompass();

  useEffect(() => {
    if (!nav) return;
    void startWatch();
    return () => stopWatch();
  }, [!!nav]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nav) return null;
  const info = last ? navigationInfo(last, nav) : null;
  const h = pickHeading({ speedMps: last?.speedMps ?? null, gpsHeadingDeg: last?.headingDeg ?? null, compassMagneticDeg: comp.headingMag }, MAGNETIC_DECLINATION_DEG);
  const rotation = info ? (h.deg !== null ? arrowRotation(info.bearingDeg, h.deg) : info.bearingDeg) : 0;

  const note = !last ? (status === 'denied' ? 'Location permission denied.' : 'Waiting for a GPS fix...')
    : h.source === 'gps' ? 'Arrow follows your walking direction.'
    : h.source === 'compass' ? 'Arrow follows the phone compass (can be off 10-20 degrees; wave the phone in a figure 8 to calibrate).'
    : comp.status === 'denied' ? 'Compass permission was denied, so the arrow shows the direction on a north-up map. Walk a few steps and it will follow your direction of travel.'
    : comp.status === 'starting' ? 'Starting the compass...'
    : 'No compass available. The arrow shows the direction on a north-up map; walk a few steps and it will follow your direction of travel.';

  return (
    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 26, width: 'min(380px, 94%)', background: 'rgba(255,255,255,.97)',
      borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.4)', padding: 10, font: '14px system-ui' }} data-testid="nav-panel">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <svg viewBox="-50 -50 100 100" width="92" height="92" aria-label="Direction arrow" data-testid="nav-arrow" data-rotation={Math.round(rotation)}
          style={{ transform: `rotate(${rotation}deg)`, transition: 'transform .25s linear', flex: 'none' }}>
          <circle r="46" fill="#eef3ee" stroke="#2f5d3a" strokeWidth="3" />
          <path d="M0 -38 L18 12 L0 4 L-18 12 Z" fill={info?.arrived ? '#2f9e44' : '#e03131'} stroke="#fff" strokeWidth="2" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }} data-testid="nav-distance">{info ? formatDistance(info.distanceM) : '...'}</div>
          <div style={{ color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {info ? `${cardinal(info.bearingDeg)} ${Math.round(info.bearingDeg).toString().padStart(3, '0')}° to ` : 'to '}<b>{nav.name}</b>
          </div>
          {last && <div style={{ color: '#666', fontSize: 12 }}>GPS ±{formatDistance(last.accuracyM)}</div>}
        </div>
        <button style={btn} onClick={stopNavigation} aria-label="Stop navigating">Stop</button>
      </div>
      {info?.arrived && <div style={{ color: '#2f9e44', fontWeight: 600, marginTop: 4 }}>You are at {nav.name} (within GPS accuracy).</div>}
      {info && !info.arrived && last && last.accuracyM > info.distanceM / 2 && (
        <div style={{ color: '#b25e00', marginTop: 4, fontSize: 13 }}>GPS accuracy is large compared with the distance, so the direction may be unreliable.</div>
      )}
      <div style={{ font: '12px system-ui', color: '#666', marginTop: 4 }}>{note}</div>
    </div>
  );
}
