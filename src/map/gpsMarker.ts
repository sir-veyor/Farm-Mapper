import type { Map as MlMap } from 'maplibre-gl';
import { useGps } from '../gps/gpsService';
import { useUi } from '../state/uiStore';
import { circlePolygon } from '../util/geo';

const SRC = 'gps';
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Blue dot + accuracy circle for the live GPS fix. Hidden when GPS is off. */
export function startGpsMarker(map: MlMap): () => void {
  const ready: Promise<void> = map.loaded() ? Promise.resolve() : new Promise((r) => map.once('load', () => r()));
  let alive = true;

  async function setup() {
    await ready;
    if (!alive || map.getSource(SRC)) return;
    map.addSource(SRC, { type: 'geojson', data: empty });
    map.addLayer({ id: 'gps:accuracy', type: 'fill', source: SRC, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#1971c2', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'gps:ring', type: 'line', source: SRC, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#1971c2', 'line-width': 1.5, 'line-opacity': 0.7 } });
    map.addLayer({ id: 'gps:dot', type: 'circle', source: SRC, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': '#1971c2', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  }

  async function update() {
    await setup();
    const src = map.getSource(SRC) as unknown as { setData(d: unknown): void } | undefined;
    if (!src || !alive) return;
    const { status, last } = useGps.getState();
    if (status === 'off' || !last) return src.setData(empty);
    src.setData({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: circlePolygon(last.lon, last.lat, Math.max(last.accuracyM, 1)) },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [last.lon, last.lat] } },
    ] });
    if (useUi.getState().follow) map.easeTo({ center: [last.lon, last.lat], duration: 400 });
  }

  const unsub = useGps.subscribe(() => void update());
  void update();
  return () => { alive = false; unsub(); };
}
