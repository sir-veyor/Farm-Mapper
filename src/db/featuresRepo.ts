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

export type FeaturePatch = Partial<Pick<VectorFeature, 'name' | 'notes' | 'style' | 'extra'>>;

export async function updateFeature(id: string, patch: FeaturePatch): Promise<VectorFeature> {
  const f = await getFeature(id);
  await assertItemsEditable(f.layerId);
  const next = { ...f, ...patch, updatedAt: nowIso() };
  await db.features.put(next);
  await afterWrite();
  return next;
}

export async function moveFeatureToLayer(id: string, layerId: string): Promise<VectorFeature> {
  const f = await getFeature(id);
  await assertItemsEditable(f.layerId);
  const dest = await assertItemsEditable(layerId);
  if (dest.kind !== 'vector') throw new Error('Destination must be a vector layer.');
  const next = { ...f, layerId, updatedAt: nowIso() };
  await db.features.put(next);
  await afterWrite();
  return next;
}

export async function removeFeature(id: string): Promise<void> {
  const f = await getFeature(id);
  await assertItemsEditable(f.layerId);
  await db.features.delete(id);
  await afterWrite();
}
