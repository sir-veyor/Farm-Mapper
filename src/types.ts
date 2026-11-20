export type HexColor = `#${string}`; // always '#rrggbb', lowercase

export type SymbolId =
  | 'pin' | 'circle' | 'square' | 'triangle' | 'star' | 'flag'
  | 'tree' | 'treestand' | 'camera' | 'feeder' | 'water' | 'gate'
  | 'parking' | 'hazard' | 'tracks' | 'x';

export interface Style {
  strokeColor: HexColor;
  strokeWidth: number;   // CSS px, 0.5-12
  strokeOpacity: number; // 0-1
  fillColor: HexColor;
  fillOpacity: number;   // 0-1
  symbol: SymbolId;
  symbolColor: HexColor;
  symbolSize: number;    // 0.5-2.5
  showLabels: boolean;
}
export type StyleOverride = Partial<Style>;

export type LayerKind = 'vector' | 'raster';

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  order: number;       // within its kind group; higher = drawn on top
  visible: boolean;    // Show/Hide
  frozen: boolean;     // out of play: not drawn, not loaded, not editable
  locked: boolean;     // drawn, but data cannot be edited or deleted
  opacity: number;     // 0-1
  defaultStyle: Style;
  rasterSourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PoiOrigin = 'gps' | 'gps-averaged' | 'map-tap' | 'import';

export interface GpsFix {
  accuracyM: number;
  altitudeM?: number | null;
  altitudeAccuracyM?: number | null;
  fixTime: string;
  avg?: { samplesUsed: number; samplesRejected: number; durationS: number; spreadM: number };
  movedManually?: boolean;
}

export interface Poi {
  id: string;
  layerId: string;
  name: string;
  notes: string;
  lon: number;
  lat: number;
  origin: PoiOrigin;
  gps?: GpsFix;
  style: StyleOverride;
  extra?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type LineOrPolygon =
  | GeoJSON.LineString | GeoJSON.MultiLineString
  | GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface VectorFeature {
  id: string;
  layerId: string;
  name: string;
  notes: string;
  geometry: LineOrPolygon;
  style: StyleOverride;
  source: { kind: 'import'; fileName: string; importedAt: string; datumShiftApplied: boolean };
  extra?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface RasterSource {
  id: string;
  name: string;
  fileName: string;
  byteSize: number;
  format: 'png' | 'jpg' | 'webp';
  scheme: 'tms' | 'xyz';
  bounds: [number, number, number, number]; // [w,s,e,n] WGS84
  center?: [number, number, number];
  minzoom: number;
  maxzoom: number;
  tileSize: 256 | 512;
  attribution?: string;
  rasterType: 'baselayer' | 'overlay';
  datum: 'wgs84-corrected' | 'unknown';
  importedAt: string;
}
export interface RasterBlob { id: string; data: Blob }

export interface Settings {
  id: 'settings';
  schemaVersion: number;
  activeLayerId: string | null;
  lastView: { lon: number; lat: number; zoom: number; bearing: number };
  gps: { averageSeconds: 5 | 10 | 30 | 60; maxAcceptAccuracyM: number; timeoutS: number };
  units: 'metric' | 'imperial';
  lastBackupAt: string | null;
  changesSinceBackup: number;
  bundledSeeded?: boolean; // legacy flag (= bundledVersion 1)
  bundledVersion?: number; // which bundled map-data set this device has been given
}
