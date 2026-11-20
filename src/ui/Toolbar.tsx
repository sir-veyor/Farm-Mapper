import { db } from '../db/db';
import { startWatch, stopWatch, getFix } from '../gps/gpsService';
import { getMap } from '../map/mapHandle';
import { act, useUi } from '../state/uiStore';
import { unionBounds, type Bounds } from '../util/geo';
import { GREEN } from './styles';

function Tb({ icon, text, on, onClick, id }: { icon: string; text: string; on?: boolean; onClick: () => void; id: string }) {
  return (
    <button onClick={onClick} data-testid={id} aria-pressed={on}
      style={{ flex: 1, minWidth: 0, border: 'none', background: on ? GREEN : 'transparent', color: on ? '#fff' : '#222', borderRadius: 8,
        padding: '3px 0', font: '11px system-ui', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 18, lineHeight: '20px' }}>{icon}</span>{text}
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
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, display: 'flex', gap: 2, padding: '4px 6px',
      background: 'rgba(255,255,255,.95)', boxShadow: '0 -1px 4px rgba(0,0,0,.25)', paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}>
      <Tb id="tb-layers" icon="🗂" text="Layers" on={ui.panel === 'layers'} onClick={() => ui.setPanel(ui.panel === 'layers' ? null : 'layers')} />
      <Tb id="tb-gps" icon="📍" text="GPS pin" on={ui.panel === 'gps'} onClick={() => ui.setPanel(ui.panel === 'gps' ? null : 'gps')} />
      <Tb id="tb-add" icon="➕" text="Tap-add" on={ui.tool.type === 'addPoi'} onClick={() => ui.setTool(ui.tool.type === 'addPoi' ? { type: 'none' } : { type: 'addPoi' })} />
      <Tb id="tb-locate" icon="⌖" text="Locate" onClick={() => void act(locateMe())} />
      <Tb id="tb-parcel" icon="⌂" text="Parcel" onClick={() => void act(zoomToParcel())} />
      <Tb id="tb-import" icon="⬇" text="Import" onClick={() => ui.setImportOpen(true)} />
      <Tb id="tb-export" icon="⬆" text="Export" onClick={() => ui.setExportOpen(true)} />
      <Tb id="tb-backup" icon="💾" text="Backup" onClick={() => ui.setBackupOpen(true)} />
    </div>
  );
}
