import { useState } from 'react';
import { db } from '../db/db';
import { useUi } from '../state/uiStore';
import { btn, btnOn } from './styles';
import { useLive } from './useLive';

/** First-run help for a fresh install: this public app has no map data, so say how to get yours. */
export function EmptyState() {
  const [hidden, setHidden] = useState(false);
  const setBackupOpen = useUi((s) => s.setBackupOpen);
  const setImportOpen = useUi((s) => s.setImportOpen);
  const empty = useLive(async () => {
    const [rasters, pois, feats] = await Promise.all([db.layers.where('kind').equals('raster').count(), db.pois.count(), db.features.count()]);
    return rasters === 0 && pois === 0 && feats === 0;
  }, ['layers', 'pois', 'features', 'rasters']);
  if (!empty || hidden) return null;
  return (
    <div data-testid="empty-state" style={{ position: 'absolute', left: 12, right: 12, top: '18%', maxWidth: 420, marginInline: 'auto', zIndex: 9, background: 'rgba(255,255,255,.97)',
      borderRadius: 14, padding: 14, boxShadow: '0 2px 12px rgba(0,0,0,.35)', font: '14px system-ui' }}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Welcome to Farm Mapper</div>
      <div style={{ color: '#333' }}>
        This app comes empty. Your maps and points are sent to you privately as a <b>starter pack</b> file.
        Save the file to your phone, then restore it here. It works with no signal afterward.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button style={btnOn} data-testid="empty-restore" onClick={() => setBackupOpen(true)}>Restore starter pack</button>
        <button style={btn} onClick={() => setImportOpen(true)}>Import a map or shared file</button>
        <button style={btn} onClick={() => setHidden(true)}>Not now</button>
      </div>
    </div>
  );
}
