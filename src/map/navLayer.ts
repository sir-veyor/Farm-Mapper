import type { Map as MlMap } from 'maplibre-gl';
import { useGps } from '../gps/gpsService';
import { useUi } from '../state/uiStore';

const SRC = 'nav';
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Line from your position to the navigation target, with a ring on the target. */
export function startNavLayer(map: MlMap): () => void {
  const ready: Promise<void> = map.loaded() ? Promise.resolve() : new Promise((r) => map.once('load', () => r()));
  let alive = true;

  async function setup() {
    await ready;
    if (!alive || map.getSource(SRC)) return;
    map.addSource(SRC, { type: 'geojson', data: empty });
    map.addLayer({ id: 'nav:line', type: 'line', source: SRC, filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#00e5ff', 'line-width': 3, 'line-dasharray': [2, 1.5], 'line-opacity': 0.95 } });
    map.addLayer({ id: 'nav:target', type: 'circle', source: SRC, filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 16, 'circle-color': '#00e5ff', 'circle-opacity': 0.15, 'circle-stroke-color': '#00e5ff', 'circle-stroke-width': 3 } });
  }

  async function update() {
    await setup();
    const src = map.getSource(SRC) as unknown as { setData(d: unknown): void } | undefined;
    const nav = useUi.getState().nav;
    if (!src || !alive) return;
    if (!nav) return src.setData(empty);
    const { last } = useGps.getState();
    const features: GeoJSON.Feature[] = [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [nav.lon, nav.lat] } }];
    if (last) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[last.lon, last.lat], [nav.lon, nav.lat]] } });
    src.setData({ type: 'FeatureCollection', features });
  }

  const offs = [useUi.subscribe((s, p) => { if (s.nav !== p.nav) void update(); }), useGps.subscribe(() => { if (useUi.getState().nav) void update(); })];
  void update();
  return () => { alive = false; offs.forEach((o) => o()); };
}
