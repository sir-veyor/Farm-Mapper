import { APP_DEFAULT_STYLE } from '../config';
import { emit } from '../util/events';
import { newId, nowIso } from '../util/ids';
import type { Layer, LayerKind, Style } from '../types';
import { db } from './db';
import { LayerFrozenError, LayerLockedError, NotFoundError } from './errors';
import { bumpChangeCounter, getSettings, patchSettings } from './settingsRepo';

export async function getLayer(id: string): Promise<Layer> {
  const l = await db.layers.get(id);
  if (!l) throw new NotFoundError('Layer');
  return l;
}

export async function listLayers(): Promise<Layer[]> {
  return (await db.layers.toArray()).sort((a, b) => a.order - b.order);
}

/** Items in the layer may be added/edited/moved/deleted. Throws if frozen or locked. */
export async function assertItemsEditable(layerId: string): Promise<Layer> {
  const l = await getLayer(layerId);
  if (l.frozen) throw new LayerFrozenError(layerId);
  if (l.locked) throw new LayerLockedError(layerId);
  return l;
}

/** The layer itself may be deleted. Only a lock blocks this. */
export async function assertLayerDeletable(layerId: string): Promise<Layer> {
  const l = await getLayer(layerId);
  if (l.locked) throw new LayerLockedError(layerId);
  return l;
}

async function assertNotLocked(layerId: string): Promise<Layer> {
  const l = await getLayer(layerId);
  if (l.locked) throw new LayerLockedError(layerId);
  return l;
}

async function nextOrder(kind: LayerKind): Promise<number> {
  const same = (await db.layers.where('kind').equals(kind).toArray()).map((l) => l.order);
  return same.length ? Math.max(...same) + 1 : 0;
}

/** Builds a Layer record (not saved). Shared with rasterRepo. */
export async function makeLayer(kind: LayerKind, name: string, extra: Partial<Layer> = {}): Promise<Layer> {
  const t = nowIso();
  return {
    id: newId(), name, kind, order: await nextOrder(kind),
    visible: true, frozen: false, locked: false, opacity: 1,
    defaultStyle: { ...APP_DEFAULT_STYLE },
    createdAt: t, updatedAt: t, ...extra,
  };
}

async function save(layer: Layer): Promise<Layer> {
  const next = { ...layer, updatedAt: nowIso() };
  await db.layers.put(next);
  await bumpChangeCounter();
  emit('layers');
  return next;
}

export async function createVectorLayer(name: string, defaultStyle?: Partial<Style>): Promise<Layer> {
  const l = await makeLayer('vector', name);
  if (defaultStyle) l.defaultStyle = { ...l.defaultStyle, ...defaultStyle };
  return save(l);
}

export async function renameLayer(id: string, name: string): Promise<Layer> {
  return save({ ...(await assertNotLocked(id)), name });
}

export async function setDefaultStyle(id: string, style: Partial<Style>): Promise<Layer> {
  const l = await assertNotLocked(id);
  return save({ ...l, defaultStyle: { ...l.defaultStyle, ...style } });
}

/** Display-only: allowed even when locked or frozen. */
export async function setOpacity(id: string, opacity: number): Promise<Layer> {
  return save({ ...(await getLayer(id)), opacity: Math.min(1, Math.max(0, opacity)) });
}

/** Frozen layers cannot be shown/hidden; their visible flag is preserved for thawing. */
export async function setVisible(id: string, visible: boolean): Promise<Layer> {
  const l = await getLayer(id);
  if (l.frozen) throw new LayerFrozenError(id);
  return save({ ...l, visible });
}

async function clearActiveIf(id: string): Promise<void> {
  const s = await getSettings();
  if (s.activeLayerId === id) await patchSettings({ activeLayerId: null });
}

export async function setFrozen(id: string, frozen: boolean): Promise<Layer> {
  const l = await save({ ...(await getLayer(id)), frozen });
  if (frozen) await clearActiveIf(id);
  return l;
}

export async function setLocked(id: string, locked: boolean): Promise<Layer> {
  const l = await save({ ...(await getLayer(id)), locked });
  if (locked) await clearActiveIf(id);
  return l;
}

/** Swap order with the neighbour of the same kind. Display-only: allowed when locked/frozen. */
export async function moveLayer(id: string, dir: 'up' | 'down'): Promise<void> {
  const l = await getLayer(id);
  const group = (await db.layers.where('kind').equals(l.kind).toArray()).sort((a, b) => a.order - b.order);
  const i = group.findIndex((g) => g.id === id);
  const j = dir === 'up' ? i + 1 : i - 1; // higher order = drawn on top
  if (j < 0 || j >= group.length) return;
  const t = nowIso();
  await db.transaction('rw', db.layers, async () => {
    await db.layers.put({ ...group[i], order: group[j].order, updatedAt: t });
    await db.layers.put({ ...group[j], order: group[i].order, updatedAt: t });
  });
  await bumpChangeCounter();
  emit('layers');
}

export async function deleteLayer(id: string): Promise<void> {
  const l = await assertLayerDeletable(id);
  await db.transaction('rw', [db.layers, db.pois, db.features, db.rasterSources, db.rasterBlobs], async () => {
    await db.pois.where('layerId').equals(id).delete();
    await db.features.where('layerId').equals(id).delete();
    if (l.rasterSourceId) {
      await db.rasterSources.delete(l.rasterSourceId);
      await db.rasterBlobs.delete(l.rasterSourceId);
    }
    await db.layers.delete(id);
  });
  await clearActiveIf(id);
  await bumpChangeCounter();
  emit('layers', 'pois', 'features', 'rasters');
}

export async function setActiveLayer(id: string | null): Promise<void> {
  if (id !== null) {
    const l = await assertItemsEditable(id);
    if (l.kind !== 'vector') throw new Error('Active layer must be a vector layer.');
  }
  await patchSettings({ activeLayerId: id });
}
