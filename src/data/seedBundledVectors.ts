import { APP_DEFAULT_STYLE } from '../config';
import { db } from '../db/db';
import { makeLayer } from '../db/layersRepo';
import { getSettings } from '../db/settingsRepo';
import type { Poi, VectorFeature } from '../types';
import { emit } from '../util/events';
import { newId, nowIso } from '../util/ids';
import { BUNDLED_VECTORS, type BundledVectorLayer } from './bundledVectors';

async function seedOne(def: BundledVectorLayer): Promise<void> {
  // Reuse an editable layer of the same name that you already made; a locked or frozen one is left alone.
  const existing = (await db.layers.toArray()).find((l) => l.kind === 'vector' && l.name === def.name && !l.frozen && !l.locked);
  const layer = existing ?? await makeLayer('vector', def.name, { defaultStyle: { ...APP_DEFAULT_STYLE, ...def.style } });
  if (!existing) await db.layers.add(layer);
  const t = nowIso();
  const features: VectorFeature[] = def.features.map((f) => ({
    id: newId(), layerId: layer.id, name: f.name, notes: '', geometry: f.geometry, style: {}, extra: f.extra,
    source: { kind: 'import', fileName: def.sourceFile, importedAt: t, datumShiftApplied: false }, createdAt: t, updatedAt: t,
  }));
  const pois: Poi[] = def.stands.map((s) => ({
    id: newId(), layerId: layer.id, name: s.name, notes: s.notes, lon: s.lon, lat: s.lat, origin: 'import', style: {},
    createdAt: t, updatedAt: t,
  }));
  if (features.length) await db.features.bulkAdd(features);
  if (pois.length) await db.pois.bulkAdd(pois);
}

/**
 * Adds the bundled parcel boundary, trails and tree stands once per device (each is remembered by key), so
 * anything you later delete, move or restyle is never put back. Runs from data inside the app: no network needed.
 */
export async function seedBundledVectors(): Promise<string[]> {
  const done = new Set((await getSettings()).seededVectors ?? []);
  const todo = BUNDLED_VECTORS.filter((d) => !done.has(d.key));
  if (!todo.length) return [];
  await db.transaction('rw', [db.layers, db.pois, db.features, db.settings], async () => {
    for (const def of todo) { await seedOne(def); done.add(def.key); }
    const s = await getSettings();
    await db.settings.put({ ...s, seededVectors: [...done] });
  });
  emit('layers', 'pois', 'features', 'settings');
  return todo.map((d) => d.name);
}
