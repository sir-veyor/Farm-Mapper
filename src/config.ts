import type { Style, SymbolId } from './types';

export const MAP_MAX_ZOOM = 22;
export const SCHEMA_VERSION = 1;

export const APP_DEFAULT_STYLE: Style = {
  strokeColor: '#e8590c',
  strokeWidth: 3,
  strokeOpacity: 1,
  fillColor: '#e8590c',
  fillOpacity: 0.25,
  symbol: 'pin',
  symbolColor: '#d6336c',
  symbolSize: 1,
  showLabels: true,
};

export const SYMBOLS: SymbolId[] = [
  'pin', 'circle', 'square', 'triangle', 'star', 'flag', 'tree', 'treestand',
  'camera', 'feeder', 'water', 'gate', 'parking', 'hazard', 'tracks', 'x',
];

export const DEFAULT_VIEW = { lon: -77.481, lat: 42.399, zoom: 14, bearing: 0 };

/**
 * NAD83(2011) -> WGS84 (G2139) shift, epoch 2026.9, valid only within ~50 km of
 * the parcel (-77.48, 42.40). WGS84 position minus NAD83(2011) position.
 * For another region recompute with pyproj (EPSG:6318 -> EPSG:9755).
 */
export const NAD83_TO_WGS84_SHIFT = { dEastM: -0.74, dNorthM: 1.078 };
