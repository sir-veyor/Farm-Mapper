import { emit } from '../util/events';
import type { Layer, RasterSource } from '../types';
import { db } from './db';
import { NotFoundError } from './errors';
import { makeLayer } from './layersRepo';
import { bumpChangeCounter } from './settingsRepo';

/** Stores the source + file blob and creates its raster layer in one transaction. */
export async function addRaster(source: RasterSource, blob: Blob, layerName?: string): Promise<Layer> {
  const layer = await makeLayer('raster', layerName ?? source.name, {
    rasterSourceId: source.id,
    // imagery (baselayer) sits below overlays: give it the lowest order
  });
  if (source.rasterType === 'baselayer') {
    const raster = await db.layers.where('kind').equals('raster').toArray();
    if (raster.length) layer.order = Math.min(...raster.map((l) => l.order)) - 1;
  }
  await db.transaction('rw', [db.layers, db.rasterSources, db.rasterBlobs], async () => {
    await db.rasterSources.add(source);
    await db.rasterBlobs.add({ id: source.id, data: blob });
    await db.layers.add(layer);
  });
  await bumpChangeCounter();
  emit('layers', 'rasters');
  return layer;
}

export async function getRasterSource(id: string): Promise<RasterSource> {
  const s = await db.rasterSources.get(id);
  if (!s) throw new NotFoundError('Raster source');
  return s;
}

export async function getRasterBlob(id: string): Promise<Blob> {
  const b = await db.rasterBlobs.get(id);
  if (!b) throw new NotFoundError('Raster data');
  return b.data;
}

export async function updateRasterSource(id: string, patch: Partial<RasterSource>): Promise<void> {
  await db.rasterSources.update(id, patch);
  await bumpChangeCounter();
  emit('rasters');
}
