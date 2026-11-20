import type { LineOrPolygon, Style } from '../types';
import boundaryData from './boundary.json';
import trailsData from './trails.json';
import { TREE_STANDS } from './treeStands';

/** "Single stand 2" -> "Single stand", "single stand (2)" -> "single stand". */
export const stripNumbering = (name: string): string => name.replace(/\s*\(\d+\)\s*$/, '').replace(/\s+\d+\s*$/, '');

export interface BundledFeature { name: string; geometry: LineOrPolygon; extra?: Record<string, string> }
export interface BundledStand { name: string; notes: string; lon: number; lat: number }

export interface BundledVectorLayer {
  key: string;                    // stored once seeded, so it never repeats
  name: string;
  style: Partial<Style>;          // the layer's default style
  sourceFile: string;
  features: BundledFeature[];
  stands: BundledStand[];
}

type Raw = { name: string; cad?: string; lines: number[][][] };
const toGeometry = (lines: number[][][]): LineOrPolygon =>
  lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
const toFeatures = (raw: Raw[]): BundledFeature[] =>
  raw.map((r) => ({ name: r.name, geometry: toGeometry(r.lines), extra: r.cad ? { cad_id: r.cad } : undefined }));

/** Listed bottom to top: layers are created in this order, so the boundary ends up lowest and tree stands on top. */
export const BUNDLED_VECTORS: BundledVectorLayer[] = [
  {
    key: 'boundary', name: 'Boundary', sourceFile: '8225 wessels hill rd.kmz',
    style: { strokeColor: '#fe00fe', strokeWidth: 3, strokeOpacity: 1, fillOpacity: 0 },
    features: toFeatures(boundaryData as Raw[]), stands: [],
  },
  {
    key: 'trails', name: 'Trails', sourceFile: 'Farm Trails.kmz',
    style: { strokeColor: '#fcc419', strokeWidth: 2.5, strokeOpacity: 1, strokeDash: 'dashed' },
    features: toFeatures(trailsData as Raw[]), stands: [],
  },
  {
    key: 'tracking', name: 'Tracking', sourceFile: '',
    style: { strokeColor: '#00b4d8', strokeWidth: 3.5, strokeOpacity: 0.95, strokeDash: 'solid', searchBandFt: 60 },
    features: [], stands: [],
  },
  {
    key: 'tree-stands', name: 'Tree Stands', sourceFile: 'all_tree_stands.kmz',
    style: { symbol: 'treestand', symbolColor: '#f08c00' },
    features: [],
    stands: TREE_STANDS.map((s) => ({ name: s.name, notes: `Hunt area: ${s.area}`, lon: s.lon, lat: s.lat })),
  },
];
