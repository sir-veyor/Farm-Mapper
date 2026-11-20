import type { Map as MlMap } from 'maplibre-gl';
import { db } from '../db/db';
import { listLayers } from '../db/layersRepo';
import type { Poi, VectorFeature } from '../types';
import { isOverlayAnchor, vectorLayerIds, vectorSourceKey } from './layerIds';
import { vectorLayerSpecs } from './styleExpressions';
import { layerToGeoJSON } from './toGeoJSON';

export interface VectorSyncState { labels: boolean; known: Map<string, { sig: string; labels: boolean }> }

function group<T extends { layerId: string }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const i of items) { const a = m.get(i.layerId); if (a) a.push(i); else m.set(i.layerId, [i]); }
  return m;
}

function removeVector(map: MlMap, layerId: string) {
  for (const id of Object.values(vectorLayerIds(layerId))) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(vectorSourceKey(layerId))) map.removeSource(vectorSourceKey(layerId));
}

/**
 * DB -> map for vector layers. A layer is on the map iff it is not frozen; hidden layers keep their
 * source with visibility:none. Source data is only re-sent when its JSON changed.
 */
export async function reconcileVector(map: MlMap, st: VectorSyncState): Promise<void> {
  const [layers, pois, feats] = await Promise.all([listLayers(), db.pois.toArray(), db.features.toArray()]);
  const poiBy = group<Poi>(pois), featBy = group<VectorFeature>(feats);
  const vectors = layers.filter((l) => l.kind === 'vector' && !l.frozen).sort((a, b) => a.order - b.order);
  const wanted = new Set(vectors.map((l) => l.id));

  for (const id of [...st.known.keys()]) if (!wanted.has(id)) { removeVector(map, id); st.known.delete(id); }

  for (const l of vectors) {
    const fc = layerToGeoJSON(l, poiBy.get(l.id) ?? [], featBy.get(l.id) ?? []);
    const sig = JSON.stringify(fc);
    const key = vectorSourceKey(l.id);
    const prev = st.known.get(l.id);

    if (!prev) {
      map.addSource(key, { type: 'geojson', data: fc });
      for (const spec of vectorLayerSpecs(l.id, key, l.opacity, l.visible, st.labels)) map.addLayer(spec);
      st.known.set(l.id, { sig, labels: st.labels });
    } else {
      if (prev.sig !== sig) { (map.getSource(key) as unknown as { setData(d: unknown): void }).setData(fc); prev.sig = sig; }
      const ids = vectorLayerIds(l.id);
      const vis = l.visible ? 'visible' : 'none';
      for (const id of Object.values(ids)) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
      map.setPaintProperty(ids.fill, 'fill-opacity', ['*', ['get', '_fillO'], l.opacity]);
      map.setPaintProperty(ids.line, 'line-opacity', ['*', ['get', '_strokeO'], l.opacity]);
      map.setPaintProperty(ids.point, 'icon-opacity', l.opacity);
      if (map.getLayer(ids.label)) map.setPaintProperty(ids.label, 'text-opacity', l.opacity);
    }
  }

  // Stacking: ascending by order, all below the selection / GPS overlays.
  const anchor = map.getStyle().layers.find((x) => isOverlayAnchor(x.id))?.id;
  for (const l of vectors) {
    const ids = vectorLayerIds(l.id);
    for (const id of [ids.fill, ids.line, ids.point, ids.label]) if (map.getLayer(id)) map.moveLayer(id, anchor);
  }
}
