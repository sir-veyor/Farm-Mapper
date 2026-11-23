import { useState } from 'react';
import { db } from '../db/db';
import { startWatch, stopWatch, getFix } from '../gps/gpsService';
import { getMap } from '../map/mapHandle';
import { useMeasure } from '../state/measureStore';
import { act, useUi } from '../state/uiStore';
import { useTrack } from '../track/trackService';
import { unionBounds, type Bounds } from '../util/geo';
import { GREEN } from './styles';

function Tb({ icon, text, on, onClick, id, badge }: { icon: string; text: string; on?: boolean; onClick: () => void; id: string; badge?: boolean }) {
  return (
    <button onClick={onClick} data-testid={id} aria-pressed={on}
      style={{ flex: 1, minWidth: 0, border: 'none', background: on ? GREEN : 'transparent', color: on ? '#fff' : '#222', borderRadius: 8, position: 'relative',
        padding: '3px 0', font: '11px system-ui', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 18, lineHeight: '20px' }}>{icon}</span>{text}
      {badge && <span style={{ position: 'absolute', top: 2, right: '24%', width: 9, height: 9, borderRadius: 5, background: '#e03131', boxShadow: '0 0 0 2px #fff' }} />}
    </button>
  );
}

async function zoomToParcel() {
  const layers = (await db.layers.toArray()).filter((l) => l.kind === 'raster' && !l.frozen);
  const sources = await db.rasterSources.bulkGet(layers.map((l) => l.rasterSourceId!));
  const b = unionBounds(sources.filter(Boolean).map((s) => s!.bounds as Bounds));
  if (!b) return useUi.getState().toast('No imagery loaded yet.', 'info');
  getMap()?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30, maxZoom: 19, duration: 700 });
}

async function locateMe() {
  await startWatch();
  try {
    const f = await getFix(5000, 20000);
    getMap()?.flyTo({ center: [f.lon, f.lat], zoom: Math.max(getMap()!.getZoom(), 17), duration: 700 });
  } finally { setTimeout(stopWatch, 30000); }
}

export function Toolbar() {
  const ui = useUi();
  const recording = useTrack((s) => s.status === 'recording');
  const [more, setMore] = useState(false);
  const measuring = ui.tool.type === 'measure';
  const item = (id: string, icon: string, text: string, fn: () => void) => (
    <button key={id} data-testid={id} onClick={() => { setMore(false); fn(); }}
      style={{ display: 'flex', gap: 8, alignItems: 'center', border: 'none', background: 'transparent', font: '15px system-ui', padding: '8px 12px', width: '100%', cursor: 'pointer' }}>
      <span style={{ width: 22 }}>{icon}</span>{text}
    </button>
  );
  return (
    <>
      {more && (
        <div style={{ position: 'absolute', right: 6, bottom: 58, zIndex: 22, background: '#fff', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,.4)', minWidth: 160 }}>
          {item('tb-parcel', '⌂', 'Zoom to parcel', () => void act(zoomToParcel()))}
          {item('tb-import', '⬇', 'Import', () => ui.setImportOpen(true))}
          {item('tb-export', '⬆', 'Export', () => ui.setExportOpen(true))}
          {item('tb-backup', '💾', 'Backup', () => ui.setBackupOpen(true))}
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, display: 'flex', gap: 2, padding: '4px 6px',
        background: 'rgba(255,255,255,.95)', boxShadow: '0 -1px 4px rgba(0,0,0,.25)', paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}>
        <Tb id="tb-layers" icon="🗂" text="Layers" on={ui.panel === 'layers'} onClick={() => ui.setPanel(ui.panel === 'layers' ? null : 'layers')} />
        <Tb id="tb-gps" icon="📍" text="GPS pin" on={ui.panel === 'gps'} onClick={() => ui.setPanel(ui.panel === 'gps' ? null : 'gps')} />
        <Tb id="tb-locate" icon="⌖" text="Locate" onClick={() => void act(locateMe())} />
        <Tb id="tb-measure" icon="📏" text="Measure" on={measuring} onClick={() => { useMeasure.getState().clear(); ui.setTool(measuring ? { type: 'none' } : { type: 'measure' }); }} />
        <Tb id="tb-track" icon="👣" text="Track" on={ui.panel === 'tracks'} badge={recording} onClick={() => ui.setPanel(ui.panel === 'tracks' ? null : 'tracks')} />
        <Tb id="tb-add" icon="➕" text="Tap-add" on={ui.tool.type === 'addPoi'} onClick={() => ui.setTool(ui.tool.type === 'addPoi' ? { type: 'none' } : { type: 'addPoi' })} />
        <Tb id="tb-more" icon="⋯" text="More" on={more} onClick={() => setMore(!more)} />
      </div>
    </>
  );
}
