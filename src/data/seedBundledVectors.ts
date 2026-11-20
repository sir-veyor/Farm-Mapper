import { APP_DEFAULT_STYLE } from '../config';
import { db } from '../db/db';
import { makeLayer } from '../db/layersRepo';
import { getSettings } from '../db/settingsRepo';
import type { Poi, VectorFeature } from '../types';
import { emit } from '../util/events';
import { newId, nowIso } from '../util/ids';
import { BUNDLED_VECTORS, stripNumbering, type BundledVectorLayer } from './bundledVectors';

const editableLayer = async (name: string) =>
  (await db.layers.toArray()).find((l) => l.kind === 'vector' && l.name === name && !l.frozen && !l.locked);
const featuresOf = (def: BundledVectorLayer, layerId: string, t: string): VectorFeature[] =>
  def.features.map((f) => ({
    id: newId(), layerId, name: f.name, notes: '', geometry: f.geometry, style: {}, extra: f.extra,
    source: { kind: 'import', fileName: def.sourceFile, importedAt: t, datumShiftApplied: false }, createdAt: t, updatedAt: t,
  }));
const bundled = (key: string) => BUNDLED_VECTORS.find((d) => d.key === key)!;

/**
 * One-time fixes for devices that were seeded by an earlier version of the app. They only touch untouched bundled
 * data in editable layers, and never run on a device that was just seeded with the current data.
 */
const MIGRATIONS: { key: string; forLayer: string; run: () => Promise<void> }[] = [
  {
    // v1 trails were both edges of each trail; v2 is one centerline, dashed.
    key: 'm:trails-centerline', forLayer: 'trails',
    run: async () => {
      const def = bundled('trails');
      const layer = await editableLayer(def.name);
      if (!layer) return;
      const old = (await db.features.where('layerId').equals(layer.id).toArray()).filter((f) => f.extra?.cad_id);
      if (!old.length) return; // the user already replaced or removed them
      await db.features.bulkDelete(old.map((f) => f.id));
      await db.features.bulkAdd(featuresOf(def, layer.id, nowIso()));
      if (layer.defaultStyle.strokeDash === undefined) await db.layers.put({ ...layer, defaultStyle: { ...layer.defaultStyle, strokeDash: 'dashed' }, updatedAt: nowIso() });
    },
  },
  {
    // the Tracking layer gained the shaded "area searched" band (60 ft wide by default; change it in Track)
    key: 'm:tracking-band', forLayer: 'tracking',
    run: async () => {
      const layer = await editableLayer(bundled('tracking').name);
      if (layer && layer.defaultStyle.searchBandFt === undefined) {
        await db.layers.put({ ...layer, defaultStyle: { ...layer.defaultStyle, searchBandFt: 60 }, updatedAt: nowIso() });
      }
    },
  },
  {
    // numbered stand names ("Single stand 3") lose their number; names you edited are left alone.
    key: 'm:stand-names', forLayer: 'tree-stands',
    run: async () => {
      const layer = await editableLayer(bundled('tree-stands').name);
      if (!layer) return;
      const pois = await db.pois.where('layerId').equals(layer.id).toArray();
      for (const s of bundled('tree-stands').stands) {
        const p = pois.find((x) => Math.abs(x.lon - s.lon) < 1e-7 && Math.abs(x.lat - s.lat) < 1e-7 && x.name !== s.name && stripNumbering(x.name) === s.name);
        if (p) await db.pois.put({ ...p, name: s.name, updatedAt: nowIso() });
      }
    },
  },
];

async function seedOne(def: BundledVectorLayer): Promise<void> {
  // Reuse an editable layer of the same name that you already made; a locked or frozen one is left alone.
  const existing = (await db.layers.toArray()).find((l) => l.kind === 'vector' && l.name === def.name && !l.frozen && !l.locked);
  const layer = existing ?? await makeLayer('vector', def.name, { defaultStyle: { ...APP_DEFAULT_STYLE, ...def.style } });
  if (!existing) await db.layers.add(layer);
  const t = nowIso();
  const features = featuresOf(def, layer.id, t);
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
  const pending = MIGRATIONS.filter((m) => !done.has(m.key));
  if (!todo.length && !pending.length) return [];
  await db.transaction('rw', [db.layers, db.pois, db.features, db.settings], async () => {
    for (const def of todo) { await seedOne(def); done.add(def.key); }
    for (const m of pending) {
      if (!todo.some((d) => d.key === m.forLayer)) await m.run(); // freshly seeded layers already have the current data
      done.add(m.key);
    }
    const s = await getSettings();
    await db.settings.put({ ...s, seededVectors: [...done] });
  });
  emit('layers', 'pois', 'features', 'settings');
  return todo.map((d) => d.name);
}
