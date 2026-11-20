import type { LayerSpecification } from 'maplibre-gl';
import { vectorLayerIds } from './layerIds';

const GEOM = ['geometry-type'] as const;
const isPoint = ['==', GEOM, 'Point'];
const isPolygon = ['==', GEOM, 'Polygon']; // also matches MultiPolygon
const isLine = ['==', GEOM, 'LineString'];

const lineOrArea = ['any', isLine, isPolygon];
const dashIs = (d: string) => ['==', ['coalesce', ['get', '_dash'], 'solid'], d];

const FT_TO_M = 0.3048;
// MapLibre uses 512 px tiles: metres per pixel = 78271.517 * cos(lat) / 2^zoom. The parcel is small, so one latitude serves.
const BAND_LAT = 42.4;
const M_PER_PX_Z0 = 78271.517 * Math.cos((BAND_LAT * Math.PI) / 180);

/** On-screen width in pixels of a ground distance, at a zoom level (used for the search band and tested directly). */
export const bandPixelWidth = (widthFt: number, zoom: number): number => (widthFt * FT_TO_M * 2 ** zoom) / M_PER_PX_Z0;

/** A line width that stays a constant number of feet on the ground as you zoom. */
export const bandWidthExpression = (widthFt: number) =>
  ['interpolate', ['exponential', 2], ['zoom'], 0, bandPixelWidth(widthFt, 0), 24, bandPixelWidth(widthFt, 24)] as never;

/** Translucent strip along recorded tracks: the ground you have already covered. */
export function bandSpec(ids: ReturnType<typeof vectorLayerIds>, source: string, widthFt: number, opacity: number, vis: 'visible' | 'none'): LayerSpecification {
  return {
    id: ids.band, type: 'line', source, filter: ['==', ['get', '_track'], 1] as never,
    layout: { visibility: vis, 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', '_stroke'], 'line-width': bandWidthExpression(widthFt), 'line-opacity': 0.28 * opacity },
  } as unknown as LayerSpecification;
}

/** line-dasharray cannot vary per feature, so there is one map layer per dash style, each filtered on `_dash`. */
function lineSpecs(ids: ReturnType<typeof vectorLayerIds>, source: string, opacity: number, vis: 'visible' | 'none'): LayerSpecification[] {
  const paint = { 'line-color': ['get', '_stroke'], 'line-width': ['get', '_strokeW'], 'line-opacity': ['*', ['get', '_strokeO'], opacity] };
  const mk = (id: string, dash: string, cap: 'round' | 'butt', pattern?: number[]) => ({
    id, type: 'line', source, filter: ['all', lineOrArea, dashIs(dash)] as never,
    layout: { visibility: vis, 'line-cap': cap, 'line-join': 'round' },
    paint: { ...paint, ...(pattern ? { 'line-dasharray': pattern } : {}) },
  }) as unknown as LayerSpecification;
  return [mk(ids.line, 'solid', 'round'), mk(ids.dash, 'dashed', 'butt', [3, 2]), mk(ids.dot, 'dotted', 'round', [0.01, 2.2])];
}

/** Paint/layout for one vector layer's four map layers. Colours/widths come from per-feature `_` props. */
export function vectorLayerSpecs(layerId: string, sourceKey: string, opacity: number, visible: boolean, labels: boolean, bandFt = 0): LayerSpecification[] {
  const ids = vectorLayerIds(layerId);
  const vis = visible ? 'visible' : 'none';
  const specs: LayerSpecification[] = [
    ...(bandFt > 0 ? [bandSpec(ids, sourceKey, bandFt, opacity, vis)] : []),
    {
      id: ids.fill, type: 'fill', source: sourceKey, filter: isPolygon as never, layout: { visibility: vis },
      paint: { 'fill-color': ['get', '_fill'], 'fill-opacity': ['*', ['get', '_fillO'], opacity] },
    },
    ...lineSpecs(ids, sourceKey, opacity, vis),
    {
      id: ids.point, type: 'symbol', source: sourceKey, filter: isPoint as never,
      layout: {
        visibility: vis, 'icon-image': ['get', '_icon'], 'icon-size': ['get', '_size'],
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-anchor': ['case', ['==', ['slice', ['get', '_icon'], 4, 7], 'pin'], 'bottom', 'center'],
      },
      paint: { 'icon-opacity': opacity },
    },
  ];
  if (labels) {
    specs.push({
      id: ids.label, type: 'symbol', source: sourceKey,
      filter: ['all', ['!=', ['get', '_label'], ''], ['any', isPoint, isPolygon]] as never,
      layout: {
        visibility: vis, 'text-field': ['get', '_label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
        'text-max-width': 9, 'text-optional': true,
        'text-anchor': ['case', isPoint, 'top', 'center'], 'text-offset': ['case', isPoint, ['literal', [0, 0.4]], ['literal', [0, 0]]],
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.6, 'text-opacity': opacity },
    } as unknown as LayerSpecification);
  }
  return specs;
}
