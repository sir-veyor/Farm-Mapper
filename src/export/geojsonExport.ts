import { resolveStyle } from '../util/style';
import type { ExportLayer } from './buildExportModel';

const r7 = (n: number) => Math.round(n * 1e7) / 1e7;
const roundCoords = (c: unknown): unknown => (Array.isArray(c) ? (typeof c[0] === 'number' ? (c as number[]).map(r7) : c.map(roundCoords)) : c);

/** One FeatureCollection with simplestyle-spec keys, so geojson.io and QGIS show the colours. */
export function toGeoJsonString(model: ExportLayer[], opts: { includeNotes: boolean }): string {
  const features: GeoJSON.Feature[] = [];
  for (const { layer, pois, features: feats } of model) {
    for (const f of feats) {
      const s = resolveStyle(layer, f.style);
      features.push({
        type: 'Feature',
        geometry: { ...f.geometry, coordinates: roundCoords(f.geometry.coordinates) } as GeoJSON.Geometry,
        properties: {
          name: f.name, ...(opts.includeNotes ? { notes: f.notes } : {}), layer: layer.name, created: f.createdAt,
          stroke: s.strokeColor, 'stroke-width': s.strokeWidth, 'stroke-opacity': s.strokeOpacity,
          fill: s.fillColor, 'fill-opacity': s.fillOpacity, ...prefixed(f.extra),
        },
      });
    }
    for (const p of pois) {
      const s = resolveStyle(layer, p.style);
      features.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [r7(p.lon), r7(p.lat)] },
        properties: {
          name: p.name, ...(opts.includeNotes ? { notes: p.notes } : {}), layer: layer.name, origin: p.origin,
          accuracy_m: p.gps ? Math.round(p.gps.accuracyM * 10) / 10 : null, created: p.createdAt,
          'marker-color': s.symbolColor, 'marker-symbol': s.symbol, 'marker-size': 'medium', ...prefixed(p.extra),
        },
      });
    }
  }
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 1);
}

function prefixed(extra?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(extra ?? {}).map(([k, v]) => [`x_${k}`, v]));
}
