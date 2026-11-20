import { emit } from '../util/events';
import { newId, nowIso } from '../util/ids';
import type { GpsFix, Poi, PoiOrigin, StyleOverride } from '../types';
import { db } from './db';
import { NotFoundError } from './errors';
import { assertItemsEditable } from './layersRepo';
import { bumpChangeCounter } from './settingsRepo';

export interface NewPoi {
  layerId: string;
  lon: number;
  lat: number;
  origin: PoiOrigin;
  name?: string;
  notes?: string;
  gps?: GpsFix;
  style?: StyleOverride;
  extra?: Record<string, string>;
}

const defaultName = () => `POI ${nowIso().slice(0, 16).replace('T', ' ')}`;

export async function getPoi(id: string): Promise<Poi> {
  const p = await db.pois.get(id);
  if (!p) throw new NotFoundError('POI');
  return p;
}

export const poisByLayer = (layerId: string): Promise<Poi[]> => db.pois.where('layerId').equals(layerId).toArray();

async function afterWrite(): Promise<void> {
  await bumpChangeCounter();
  emit('pois');
}

export async function addPoi(input: NewPoi): Promise<Poi> {
  await assertItemsEditable(input.layerId);
  const t = nowIso();
  const poi: Poi = {
    id: newId(), layerId: input.layerId, name: input.name ?? defaultName(), notes: input.notes ?? '',
    lon: input.lon, lat: input.lat, origin: input.origin, gps: input.gps,
    style: input.style ?? {}, extra: input.extra, createdAt: t, updatedAt: t,
  };
  await db.pois.add(poi);
  await afterWrite();
  return poi;
}

/** Bulk insert for imports into a freshly created (editable) layer. */
export async function addPois(layerId: string, inputs: Omit<NewPoi, 'layerId'>[]): Promise<number> {
  await assertItemsEditable(layerId);
  const t = nowIso();
  await db.pois.bulkAdd(inputs.map((i) => ({
    id: newId(), layerId, name: i.name ?? defaultName(), notes: i.notes ?? '', lon: i.lon, lat: i.lat,
    origin: i.origin, gps: i.gps, style: i.style ?? {}, extra: i.extra, createdAt: t, updatedAt: t,
  })));
  await afterWrite();
  return inputs.length;
}

export type PoiPatch = Partial<Pick<Poi, 'name' | 'notes' | 'style' | 'extra'>>;

export async function updatePoi(id: string, patch: PoiPatch): Promise<Poi> {
  const p = await getPoi(id);
  await assertItemsEditable(p.layerId);
  const next = { ...p, ...patch, updatedAt: nowIso() };
  await db.pois.put(next);
  await afterWrite();
  return next;
}

export async function movePoi(id: string, lon: number, lat: number): Promise<Poi> {
  const p = await getPoi(id);
  await assertItemsEditable(p.layerId);
  const next: Poi = { ...p, lon, lat, updatedAt: nowIso(), gps: p.gps ? { ...p.gps, movedManually: true } : p.gps };
  await db.pois.put(next);
  await afterWrite();
  return next;
}

/** Both source and destination layers must be editable. */
export async function movePoiToLayer(id: string, layerId: string): Promise<Poi> {
  const p = await getPoi(id);
  await assertItemsEditable(p.layerId);
  const dest = await assertItemsEditable(layerId);
  if (dest.kind !== 'vector') throw new Error('Destination must be a vector layer.');
  const next = { ...p, layerId, updatedAt: nowIso() };
  await db.pois.put(next);
  await afterWrite();
  return next;
}

export async function removePoi(id: string): Promise<void> {
  const p = await getPoi(id);
  await assertItemsEditable(p.layerId);
  await db.pois.delete(id);
  await afterWrite();
}

export async function clearPoiStyle(id: string): Promise<Poi> {
  return updatePoi(id, { style: {} });
}

