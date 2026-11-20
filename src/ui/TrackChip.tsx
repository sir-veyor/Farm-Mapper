import { useEffect, useState } from 'react';
import { useUi } from '../state/uiStore';
import { useTrack } from '../track/trackService';
import { formatDuration } from '../track/trackMath';
import { formatDistance } from '../util/geo';

/** Always-visible "REC" chip while a track is recording or paused. */
export function TrackChip() {
  const t = useTrack();
  const setPanel = useUi((s) => s.setPanel);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  if (t.status === 'idle') return null;
  const s = t.durationBeforeS + (t.sessionStartedAt ? (Date.now() - t.sessionStartedAt) / 1000 : 0);
  return (
    <button onClick={() => setPanel('tracks')} data-testid="track-chip"
      style={{ position: 'absolute', left: 120, top: 8, zIndex: 6, border: 'none', borderRadius: 8, padding: '7px 10px', font: '13px system-ui',
        background: t.status === 'recording' ? '#e03131' : '#b25e00', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.4)', cursor: 'pointer' }}>
      {t.status === 'recording' ? '● REC' : '❚❚ PAUSED'} {formatDuration(s)} · {formatDistance(t.distanceM)}
    </button>
  );
}
