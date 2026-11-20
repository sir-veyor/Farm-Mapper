import type { RasterSource } from '../types';
import { normalizeBounds, type Bounds } from '../util/geo';

export class MbtilesError extends Error {
  constructor(message: string) { super(message); this.name = 'MbtilesError'; }
}

export type RasterFormat = RasterSource['format'];

export function sniffFormat(b: Uint8Array): RasterFormat | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

export const isGzip = (b: Uint8Array): boolean => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;

/** PNG width from the IHDR chunk; 512 only if the tile really is 512 wide, else 256. */
export function pngTileSize(b: Uint8Array): 256 | 512 {
  if (sniffFormat(b) !== 'png' || b.length < 24) return 256;
  const width = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
  return width === 512 ? 512 : 256;
}

/** What the reader learned by querying the tiles table (all values already scheme-corrected). */
export interface MbtilesProbe {
  minzoom: number;
  maxzoom: number;
  sampleTile: Uint8Array | null;     // any tile at maxzoom
  extentBounds: Bounds | null;       // tile extent at maxzoom
  scheme: 'tms' | 'xyz';
}

export type RasterFields = Omit<RasterSource, 'id' | 'datum' | 'importedAt'>;

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseBounds(v: string | undefined): Bounds | null {
  if (!v) return null;
  return normalizeBounds(v.split(',').map((s) => Number(s.trim())));
}

export function buildRasterFields(
  meta: Record<string, string>, probe: MbtilesProbe, fileName: string, byteSize: number,
): RasterFields {
  const declared = (meta.format ?? '').trim().toLowerCase();
  if (declared === 'pbf' || declared === 'mvt' || (probe.sampleTile && isGzip(probe.sampleTile))) {
    throw new MbtilesError('This is a vector-tile MBTiles file. Only raster (png/jpg/webp) tiles are supported.');
  }

  const sniffed = probe.sampleTile ? sniffFormat(probe.sampleTile) : null;
  const fromMeta: RasterFormat | null =
    declared === 'png' ? 'png' : declared === 'jpg' || declared === 'jpeg' ? 'jpg' : declared === 'webp' ? 'webp' : null;
  const format = sniffed ?? fromMeta; // trust the bytes over the label
  if (!format) throw new MbtilesError('Could not tell the tile image format (expected png, jpg or webp).');

  let minzoom = num(meta.minzoom) ?? probe.minzoom;
  let maxzoom = num(meta.maxzoom) ?? probe.maxzoom;
  if (minzoom > maxzoom) [minzoom, maxzoom] = [maxzoom, minzoom];
  minzoom = Math.max(0, Math.round(minzoom));
  maxzoom = Math.min(22, Math.round(maxzoom));

  const bounds = parseBounds(meta.bounds) ?? probe.extentBounds;
  if (!bounds) throw new MbtilesError('The file has no usable bounds and no tiles to compute them from.');

  let center: [number, number, number] | undefined;
  const c = (meta.center ?? '').split(',').map(Number);
  if (c.length === 3 && c.every(Number.isFinite)) center = [c[0], c[1], c[2]];

  const stem = fileName.replace(/\.mbtiles$/i, '');
  return {
    name: (meta.name ?? '').trim() || stem,
    fileName,
    byteSize,
    format,
    scheme: probe.scheme,
    bounds,
    center,
    minzoom,
    maxzoom,
    tileSize: format === 'png' && probe.sampleTile ? pngTileSize(probe.sampleTile) : 256,
    attribution: meta.attribution || undefined,
    rasterType: meta.type === 'baselayer' || format !== 'png' ? 'baselayer' : 'overlay',
  };
}
