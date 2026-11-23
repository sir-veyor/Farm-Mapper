import { emit } from '../util/events';
import { newId, nowIso } from '../util/ids';
import type { LineOrPolygon, StyleOverride, VectorFeature } from '../types';
import { db } from './db';
import { NotFoundError } from './errors';
import { assertItemsEditable } from './layersRepo';
import { bumpChangeCounter } from './settingsRepo';

export interface NewFeature {
  name: string;
  notes?: string;
  geometry: LineOrPolygon;
  style?: StyleOverride;
  source: VectorFeature['source'];
  extra?: Record<string, string>;
}

export async function getFeature(id: string): Promise<VectorFeature> {
  const f = await db.features.get(id);
  if (!f) throw new NotFoundError('Feature');
  return f;
}

export const featuresByLayer = (layerId: string): Promise<VectorFeature[]> =>
  db.features.where('layerId').equals(layerId).toArray();

async function afterWrite(): Promise<void> {
  await bumpChangeCounter();
  emit('features');
}

export async function addFeatures(layerId: string, inputs: NewFeature[]): Promise<number> {
  await assertItemsEditable(layerId);
  const t = nowIso();
  await db.features.bulkAdd(inputs.map((i) => ({
    id: newId(), layerId, name: i.name, notes: i.notes ?? '', geometry: i.geometry,
    style: i.style ?? {}, source: i.source, extra: i.extra, createdAt: t, updatedAt: t,
  })));
  await afterWrite();
  return inputs.length;
}

export async function addFeature(layerId: string, input: NewFeature): Promise<VectorFeature> {
  await assertItemsEditable(layerId);
  const t = nowIso();
  const f: VectorFeature = { id: newId(), layerId, name: input.name, notes: input.notes ?? '', geometry: input.geometry, style: input.style ?? {},
    source: input.source, extra: input.extra, createdAt: t, updatedAt: t };
  await db.features.add(f);
  await afterWrite();
  return f;
}

/** Replaces a feature's geometry (and optionally its source info) atomically. Used by the track recorder. */
export async function updateFeatureGeometry(id: string, geometry: LineOrPolygon, source?: VectorFeature['source'], patch: FeaturePatch = {}): Promise<VectorFeature> {
  const next = await db.transaction('rw', db.features, db.layers, async () => {
    const f = await getFeature(id);
    await assertItemsEditable(f.layerId);
    const n = { ...f, ...patch, geometry, source: source ?? f.source, updatedAt: nowIso() };
    await db.features.put(n);
    return n;
  });
  await afterWrite();
  return next;
}

export type FeaturePatch = Partial<Pick<VectorFeature, 'name' | 'notes' | 'style' | 'extra'>>;

const rw = <T,>(fn: () => Promise<T>): Promise<T> => db.transaction('rw', db.features, db.layers, fn);

export async function updateFeature(id: string, patch: FeaturePatch): Promise<VectorFeature> {
  const next = await rw(async () => {
    const f = await getFeature(id);
    await assertItemsEditable(f.layerId);
    const n = { ...f, ...patch, updatedAt: nowIso() };
    await db.features.put(n);
    return n;
  });
  await afterWrite();
  return next;
}

export async function moveFeatureToLayer(id: string, layerId: string): Promise<VectorFeature> {
  const next = await rw(async () => {
    const f = await getFeature(id);
    await assertItemsEditable(f.layerId);
    const dest = await assertItemsEditable(layerId);
    if (dest.kind !== 'vector') throw new Error('Destination must be a vector layer.');
    const n = { ...f, layerId, updatedAt: nowIso() };
    await db.features.put(n);
    return n;
  });
  await afterWrite();
  return next;
}

export async function removeFeature(id: string): Promise<void> {
  const f = await getFeature(id);
  await assertItemsEditable(f.layerId);
  await db.features.delete(id);
  await afterWrite();
}

export async function updateFeatureStyle(id: string, patch: StyleOverride): Promise<VectorFeature> {
  const next = await rw(async () => {
    const f = await getFeature(id);
    await assertItemsEditable(f.layerId);
    const n = { ...f, style: { ...f.style, ...patch }, updatedAt: nowIso() };
    await db.features.put(n);
    return n;
  });
  await afterWrite();
  return next;
}
