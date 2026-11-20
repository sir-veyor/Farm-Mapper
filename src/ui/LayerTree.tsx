import { db } from '../db/db';
import { listLayers, createVectorLayer } from '../db/layersRepo';
import { getSettings } from '../db/settingsRepo';
import { act, useUi } from '../state/uiStore';
import { LayerRow } from './LayerRow';
import { Sheet } from './Sheet';
import { btn } from './styles';
import { useLive } from './useLive';

function counts(keys: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(String(k), (m.get(String(k)) ?? 0) + 1);
  return m;
}

export function LayerTree() {
  const setPanel = useUi((s) => s.setPanel);
  const data = useLive(async () => {
    const [layers, sources, settings, poiKeys, featKeys] = await Promise.all([
      listLayers(), db.rasterSources.toArray(), getSettings(),
      db.pois.orderBy('layerId').keys(), db.features.orderBy('layerId').keys(),
    ]);
    const c = counts(poiKeys), f = counts(featKeys);
    const count = (id: string) => (c.get(id) ?? 0) + (f.get(id) ?? 0);
    return { layers, sources, active: settings.activeLayerId, count };
  }, ['layers', 'pois', 'features', 'rasters', 'settings']);

  const group = (kind: 'vector' | 'raster') => (data?.layers ?? []).filter((l) => l.kind === kind).sort((a, b) => b.order - a.order);
  const render = (kind: 'vector' | 'raster') => {
    const list = group(kind);
    return list.map((l, i) => (
      <LayerRow key={l.id} layer={l} active={data?.active === l.id}
        canUp={i > 0} canDown={i < list.length - 1} count={data!.count(l.id)}
        datumUnknown={!!l.rasterSourceId && data!.sources.find((s) => s.id === l.rasterSourceId)?.datum === 'unknown'} />
    ));
  };

  async function addLayer() {
    const name = window.prompt('New layer name', 'New layer');
    if (name?.trim()) await act(createVectorLayer(name.trim()));
  }

  return (
    <Sheet title="Layers" onClose={() => setPanel(null)}>
      {!data ? <div>Loading...</div> : (
        <>
          <div style={{ font: '12px system-ui', color: '#555', margin: '2px 0' }}>
            Features and pins <span style={{ float: 'right' }}>◉ = new pins go here</span>
          </div>
          {render('vector')}
          <button style={{ ...btn, margin: '8px 0' }} onClick={() => void addLayer()}>+ New layer</button>
          <div style={{ font: '12px system-ui', color: '#555', margin: '6px 0 2px' }}>Imagery and rasters</div>
          {render('raster')}
          <div style={{ font: '12px system-ui', color: '#666', marginTop: 8 }}>
            👁 show/hide · ❄ freeze (not drawn, no edits) · 🔒 lock (drawn, protected from edits and deletion)
          </div>
        </>
      )}
    </Sheet>
  );
}
