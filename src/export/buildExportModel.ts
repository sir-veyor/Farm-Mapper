import { db } from '../db/db';
import type { Layer, Poi, VectorFeature } from '../types';

export interface ExportLayer { layer: Layer; pois: Poi[]; features: VectorFeature[] }

/** Selected vector layers (frozen, locked and hidden ones included), top of the layer tree first. */
export async function buildExportModel(layerIds: string[]): Promise<ExportLayer[]> {
  const want = new Set(layerIds);
  const layers = (await db.layers.toArray()).filter((l) => l.kind === 'vector' && want.has(l.id)).sort((a, b) => b.order - a.order);
  return Promise.all(layers.map(async (layer) => ({
    layer,
    pois: await db.pois.where('layerId').equals(layer.id).toArray(),
    features: await db.features.where('layerId').equals(layer.id).toArray(),
  })));
}
