import type { LineOrPolygon, Style } from '../types';

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

/**
 * Layers every install starts with. This app is public, so it carries no map data (no imagery, boundary, trails or
 * stand locations): those arrive privately, by restoring a starter-pack backup or importing shared files.
 */
export const BUNDLED_VECTORS: BundledVectorLayer[] = [
  {
    key: 'tracking', name: 'Tracking', sourceFile: '',
    style: { strokeColor: '#00b4d8', strokeWidth: 3.5, strokeOpacity: 0.95, strokeDash: 'solid', searchBandFt: 60 },
    features: [], stands: [],
  },
];
