import type { Layer } from '../types';
import { geometryBounds, unionBounds, type Bounds } from '../util/geo';
import { db } from './db';

/** Bounds of everything in a layer, or null if empty. */
export async function layerBounds(layer: Layer): Promise<Bounds | null> {
  if (layer.kind === 'raster') {
    const s = layer.rasterSourceId ? await db.rasterSources.get(layer.rasterSourceId) : undefined;
    return s ? (s.bounds as Bounds) : null;
  }
  const [pois, feats] = await Promise.all([
    db.pois.where('layerId').equals(layer.id).toArray(),
    db.features.where('layerId').equals(layer.id).toArray(),
  ]);
  const all: Bounds[] = pois.map((p) => [p.lon, p.lat, p.lon, p.lat] as Bounds);
  for (const f of feats) { const b = geometryBounds(f.geometry); if (b) all.push(b); }
  return unionBounds(all);
}
