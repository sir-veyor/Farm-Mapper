import * as maplibregl from 'maplibre-gl';
import { getRasterBlob, getRasterSource } from '../db/rasterRepo';
import { transparentPng } from './emptyTile';
import { MbtilesReader } from './mbtilesReader';
import { xyzToTmsRow } from './tms';

const readers = new Map<string, Promise<MbtilesReader>>();
const warned = new Set<string>();
const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debugTiles');

/** Lazily opens (once) the reader for a raster source id and keeps it open. */
export function getReader(sourceId: string): Promise<MbtilesReader> {
  let p = readers.get(sourceId);
  if (!p) {
    p = (async () => {
      const [source, blob] = await Promise.all([getRasterSource(sourceId), getRasterBlob(sourceId)]);
      return MbtilesReader.open(blob, source.scheme);
    })();
    p.catch(() => readers.delete(sourceId));
    readers.set(sourceId, p);
  }
  return p;
}

/** Frees the sql.js memory for a source (freeze, delete, or scheme change). */
export async function closeReader(sourceId: string): Promise<void> {
  const p = readers.get(sourceId);
  readers.delete(sourceId);
  if (p) try { (await p).close(); } catch { /* already gone */ }
}

const URL_RE = /^mbtiles:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/;

let registered = false;
export function registerMbtilesProtocol(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('mbtiles', async (params) => {
    const m = URL_RE.exec(params.url);
    if (!m) return { data: transparentPng() };
    const [id, z, x, y] = [m[1], Number(m[2]), Number(m[3]), Number(m[4])];
    try {
      const reader = await getReader(id);
      const tile = reader.getTile(z, x, y);
      if (debug) {
        console.debug(`[tile] ${id.slice(0, 8)} z${z} x${x} yXYZ${y} -> row ${xyzToTmsRow(z, y)} ${tile ? 'HIT' : 'miss'}`);
      }
      if (!tile) return { data: transparentPng() };
      return { data: tile.buffer.slice(tile.byteOffset, tile.byteOffset + tile.byteLength) as ArrayBuffer };
    } catch (e) {
      if (!warned.has(id)) { warned.add(id); console.warn('mbtiles read failed for', id, e); }
      return { data: transparentPng() };
    }
  });
}
