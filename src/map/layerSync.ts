import type { Map as MlMap } from 'maplibre-gl';
import { db } from '../db/db';
import { listLayers } from '../db/layersRepo';
import { closeReader } from '../raster/mbtilesProtocol';
import { on } from '../util/events';
import { normalizeBounds, padBounds, unionBounds, type Bounds } from '../util/geo';
import { isVectorMapLayer, rasterLayerId, rasterSourceKey } from './layerIds';

const MAX_BOUNDS_PAD_M = 3000;

/**
 * DB -> map. Raster rules: a layer exists on the map iff it is not frozen; hidden layers
 * keep their source but get visibility:none. Rebuilds only what changed.
 */
export function startLayerSync(map: MlMap): () => void {
  const ready: Promise<void> = map.loaded() ? Promise.resolve() : new Promise((r) => map.once('load', () => r()));
  const known = new Map<string, { sourceId: string; sig: string }>(); // layerId -> state on map
  let queue: Promise<void> = Promise.resolve();

  async function removeRaster(layerId: string, sourceId: string) {
    if (map.getLayer(rasterLayerId(layerId))) map.removeLayer(rasterLayerId(layerId));
    if (map.getSource(rasterSourceKey(layerId))) map.removeSource(rasterSourceKey(layerId));
    known.delete(layerId);
    await closeReader(sourceId);
  }

  async function reconcile() {
    await ready;
    const [layers, sources] = await Promise.all([listLayers(), db.rasterSources.toArray()]);
    const srcById = new Map(sources.map((s) => [s.id, s]));
    const rasters = layers
      .filter((l) => l.kind === 'raster' && !l.frozen && l.rasterSourceId && srcById.has(l.rasterSourceId))
      .sort((a, b) => a.order - b.order);
    const wanted = new Set(rasters.map((l) => l.id));

    for (const [layerId, st] of [...known]) if (!wanted.has(layerId)) await removeRaster(layerId, st.sourceId);

    for (const l of rasters) {
      const s = srcById.get(l.rasterSourceId!)!;
      const sig = JSON.stringify([s.scheme, s.minzoom, s.maxzoom, s.tileSize, s.bounds]);
      const prev = known.get(l.id);
      if (prev && prev.sig !== sig) await removeRaster(l.id, s.id); // reader must reopen with new scheme

      if (!known.has(l.id)) {
        map.addSource(rasterSourceKey(l.id), {
          type: 'raster',
          tiles: [`mbtiles://${s.id}/{z}/{x}/{y}`],
          tileSize: s.tileSize,
          minzoom: s.minzoom,
          maxzoom: s.maxzoom,
          bounds: normalizeBounds(s.bounds) ?? undefined,
        });
        map.addLayer({
          id: rasterLayerId(l.id),
          type: 'raster',
          source: rasterSourceKey(l.id),
          layout: { visibility: l.visible ? 'visible' : 'none' },
          paint: { 'raster-opacity': l.opacity },
        });
        known.set(l.id, { sourceId: s.id, sig });
      } else {
        map.setLayoutProperty(rasterLayerId(l.id), 'visibility', l.visible ? 'visible' : 'none');
        map.setPaintProperty(rasterLayerId(l.id), 'raster-opacity', l.opacity);
      }
    }

    // Stacking: rasters ascending by order, all below any vector layer.
    const firstVector = map.getStyle().layers.find((x) => isVectorMapLayer(x.id))?.id;
    for (const l of rasters) map.moveLayer(rasterLayerId(l.id), firstVector);

    // Pan clamp: union of non-frozen raster bounds + 3 km; none when there is no raster.
    const all = unionBounds(rasters.map((l) => srcById.get(l.rasterSourceId!)!.bounds as Bounds));
    if (all) {
      const p = padBounds(all, MAX_BOUNDS_PAD_M);
      map.setMaxBounds([[p[0], p[1]], [p[2], p[3]]]);
    } else {
      map.setMaxBounds(null);
    }
  }

  const run = () => { queue = queue.then(reconcile).catch((e) => console.error('layerSync failed', e)); };
  const offs = [on('layers', run), on('rasters', run)];
  run();
  return () => offs.forEach((off) => off());
}
