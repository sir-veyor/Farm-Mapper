import type { Map as MlMap } from 'maplibre-gl';
import { useMeasure } from '../state/measureStore';
import { formatDistance, metersBetween } from '../util/geo';

const SRC = 'meas';
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Draws the on-screen measurement: line, end points, and a length label on every leg. */
export function startMeasureLayer(map: MlMap, opts: { labels: boolean }): () => void {
  const ready: Promise<void> = map.loaded() ? Promise.resolve() : new Promise((r) => map.once('load', () => r()));
  let alive = true;

  async function setup() {
    await ready;
    if (!alive || map.getSource(SRC)) return;
    map.addSource(SRC, { type: 'geojson', data: empty });
    map.addLayer({ id: 'meas:casing', type: 'line', source: SRC, filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-width': 6, 'line-opacity': 0.55 } });
    map.addLayer({ id: 'meas:line', type: 'line', source: SRC, filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 3 } });
    map.addLayer({ id: 'meas:pt', type: 'circle', source: SRC, filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', '_pt']],
      paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#000000', 'circle-stroke-width': 2.5 } });
    if (opts.labels) {
      map.addLayer({ id: 'meas:label', type: 'symbol', source: SRC, filter: ['has', '_t'],
        layout: { 'text-field': ['get', '_t'], 'text-font': ['Noto Sans Regular'], 'text-size': 14, 'text-offset': [0, -1], 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 2 } });
    }
  }

  async function update() {
    await setup();
    const src = map.getSource(SRC) as unknown as { setData(d: unknown): void } | undefined;
    if (!src || !alive) return;
    const pts = useMeasure.getState().points;
    const f: GeoJSON.Feature[] = pts.map((p) => ({ type: 'Feature', properties: { _pt: 1 }, geometry: { type: 'Point', coordinates: p } }));
    if (pts.length >= 2) {
      f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        f.push({ type: 'Feature', properties: { _t: formatDistance(metersBetween(a, b)) }, geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] } });
      }
    }
    src.setData({ type: 'FeatureCollection', features: f });
  }

  const unsub = useMeasure.subscribe(() => void update());
  void update();
  return () => { alive = false; unsub(); };
}
