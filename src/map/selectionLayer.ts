import type { Map as MlMap } from 'maplibre-gl';
import { db } from '../db/db';
import { useUi } from '../state/uiStore';
import { on } from '../util/events';
import { geometryBounds } from '../util/geo';

const SRC = 'sel';
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Cyan highlight for the selected POI / feature, drawn above all vector layers. */
export function startSelectionLayer(map: MlMap): () => void {
  const ready: Promise<void> = map.loaded() ? Promise.resolve() : new Promise((r) => map.once('load', () => r()));
  let alive = true;
  let lastId: string | null = null;

  async function setup() {
    await ready;
    if (!alive || map.getSource(SRC)) return;
    map.addSource(SRC, { type: 'geojson', data: empty });
    map.addLayer({ id: 'sel:fill', type: 'fill', source: SRC, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#00e5ff', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'sel:line', type: 'line', source: SRC, filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#00e5ff', 'line-width': 5, 'line-opacity': 0.85 } });
    map.addLayer({ id: 'sel:point', type: 'circle', source: SRC, filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 20, 'circle-color': '#00e5ff', 'circle-opacity': 0.12, 'circle-stroke-color': '#00e5ff', 'circle-stroke-width': 3 } });
  }

  async function refresh() {
    await setup();
    const src = map.getSource(SRC) as unknown as { setData(d: unknown): void } | undefined;
    if (!src || !alive) return;
    const sel = useUi.getState().selection;
    if (!sel) {
      src.setData(empty);
      if (lastId) { lastId = null; map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 250 }); }
      return;
    }
    let geometry: GeoJSON.Geometry | undefined;
    if (sel.kind === 'poi') { const p = await db.pois.get(sel.id); if (p) geometry = { type: 'Point', coordinates: [p.lon, p.lat] }; }
    else geometry = (await db.features.get(sel.id))?.geometry;
    src.setData(geometry ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: {} }] } : empty);
    if (geometry && sel.id !== lastId) { // bring it above the bottom sheet, keeping the zoom
      lastId = sel.id;
      const b = geometryBounds(geometry)!;
      map.easeTo({ center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], padding: { top: 0, left: 0, right: 0, bottom: Math.round(window.innerHeight * 0.5) }, duration: 300 });
    }
  }

  const unsub = useUi.subscribe((s, prev) => { if (s.selection !== prev.selection) void refresh(); });
  const offs = [on('pois', () => void refresh()), on('features', () => void refresh())];
  void refresh();
  return () => { alive = false; unsub(); offs.forEach((o) => o()); };
}
