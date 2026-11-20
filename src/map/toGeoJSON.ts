import type { Layer, Poi, VectorFeature } from '../types';
import { resolveStyle } from '../util/style';

/** One FeatureCollection per vector layer; every feature carries its fully resolved style as `_` props. */
export function layerToGeoJSON(
  layer: Pick<Layer, 'defaultStyle'>, pois: Poi[], feats: VectorFeature[],
): GeoJSON.FeatureCollection {
  const out: GeoJSON.Feature[] = [];
  for (const f of feats) {
    const s = resolveStyle(layer, f.style);
    out.push({
      type: 'Feature', geometry: f.geometry,
      properties: {
        _kind: 'feature', _id: f.id, _stroke: s.strokeColor, _strokeW: s.strokeWidth, _strokeO: s.strokeOpacity, _dash: s.strokeDash,
        _fill: s.fillColor, _fillO: s.fillOpacity, _label: s.showLabels ? f.name : '',
      },
    });
  }
  for (const p of pois) {
    const s = resolveStyle(layer, p.style);
    out.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: {
        _kind: 'poi', _id: p.id, _icon: `poi|${s.symbol}|${s.symbolColor}`, _size: s.symbolSize,
        _label: s.showLabels ? p.name : '',
      },
    });
  }
  return { type: 'FeatureCollection', features: out };
}
