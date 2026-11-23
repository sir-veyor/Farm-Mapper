import type { Style, SymbolId } from './types';

export const MAP_MAX_ZOOM = 22;
export const SCHEMA_VERSION = 1;

export const APP_DEFAULT_STYLE: Style = {
  strokeColor: '#e8590c',
  strokeWidth: 3,
  strokeOpacity: 1,
  strokeDash: 'solid',
  searchBandFt: 0,
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

/** Where a brand-new, empty install looks. A restored starter pack brings its own saved view. */
export const DEFAULT_VIEW = { lon: -98, lat: 39, zoom: 3, bearing: 0 };

/**
 * Magnetic declination in degrees (negative = west of true north) from the World Magnetic Model for late 2026; it moves about
 * 0.03 deg/year. Phone compasses report MAGNETIC north; true heading = magnetic + declination. Update for another region.
 */
export const MAGNETIC_DECLINATION_DEG = -11.0;

/**
 * NAD83(2011) -> WGS84 (G2139) shift in metres (WGS84 position minus NAD83(2011) position), computed with PROJ for late 2026.
 * It varies slowly with location, so it is only valid within about 50 km of where it was computed (the original survey area).
 * For another region recompute with pyproj (EPSG:6318 -> EPSG:9755) and update these numbers.
 */
export const NAD83_TO_WGS84_SHIFT = { dEastM: -0.74, dNorthM: 1.078 };
