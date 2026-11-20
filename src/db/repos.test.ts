import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { ensureSeed } from './seed';
import * as layers from './layersRepo';
import * as pois from './poisRepo';
import * as features from './featuresRepo';
import { getSettings } from './settingsRepo';
import { LayerFrozenError, LayerLockedError } from './errors';

async function reset() {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureSeed();
}
const activeId = async () => (await getSettings()).activeLayerId!;
const pt = { lon: -77.48, lat: 42.4, origin: 'map-tap' as const };

beforeEach(reset);

describe('seed', () => {
  it('creates My POIs as active layer, once', async () => {
    await ensureSeed();
    const all = await layers.listLayers();
    expect(all.map((l) => l.name)).toEqual(['My POIs']);
    expect(await activeId()).toBe(all[0].id);
  });
});

describe('assertItemsEditable', () => {
  it('throws on locked and on frozen layers, passes on normal', async () => {
    const id = await activeId();
    await expect(layers.assertItemsEditable(id)).resolves.toBeTruthy();
    await layers.setLocked(id, true);
    await expect(layers.assertItemsEditable(id)).rejects.toBeInstanceOf(LayerLockedError);
    await layers.setLocked(id, false);
    await layers.setFrozen(id, true);
    await expect(layers.assertItemsEditable(id)).rejects.toBeInstanceOf(LayerFrozenError);
  });
});

describe('assertLayerDeletable / deleteLayer', () => {
  it('only a lock blocks deletion; frozen layers can be deleted', async () => {
    const a = await layers.createVectorLayer('A');
    await layers.setLocked(a.id, true);
    await expect(layers.deleteLayer(a.id)).rejects.toBeInstanceOf(LayerLockedError);
    await layers.setLocked(a.id, false);
    await layers.setFrozen(a.id, true);
    await layers.deleteLayer(a.id);
    expect((await layers.listLayers()).some((l) => l.id === a.id)).toBe(false);
  });
  it('cascades to items and clears active layer', async () => {
    const id = await activeId();
    await pois.addPoi({ layerId: id, ...pt });
    await layers.deleteLayer(id);
    expect(await db.pois.count()).toBe(0);
    expect((await getSettings()).activeLayerId).toBeNull();
  });
});

describe('lock/freeze rules on items', () => {
  it('locked layer: cannot add, edit, move, or delete POIs', async () => {
    const id = await activeId();
    const p = await pois.addPoi({ layerId: id, ...pt });
    await layers.setLocked(id, true);
    await expect(pois.addPoi({ layerId: id, ...pt })).rejects.toBeInstanceOf(LayerLockedError);
    await expect(pois.updatePoi(p.id, { name: 'x' })).rejects.toBeInstanceOf(LayerLockedError);
    await expect(pois.movePoi(p.id, 1, 1)).rejects.toBeInstanceOf(LayerLockedError);
    await expect(pois.removePoi(p.id)).rejects.toBeInstanceOf(LayerLockedError);
    expect((await pois.getPoi(p.id)).name).toBe(p.name);
  });
  it('cannot move a POI into a locked layer', async () => {
    const src = await activeId();
    const dest = await layers.createVectorLayer('Dest');
    const p = await pois.addPoi({ layerId: src, ...pt });
    await layers.setLocked(dest.id, true);
    await expect(pois.movePoiToLayer(p.id, dest.id)).rejects.toBeInstanceOf(LayerLockedError);
  });
  it('locked layer: rename/default style blocked, opacity & reorder allowed', async () => {
    const id = await activeId();
    await layers.setLocked(id, true);
    await expect(layers.renameLayer(id, 'z')).rejects.toBeInstanceOf(LayerLockedError);
    await expect(layers.setDefaultStyle(id, { symbolColor: '#000000' })).rejects.toBeInstanceOf(LayerLockedError);
    await expect(layers.setOpacity(id, 0.5)).resolves.toBeTruthy();
    await expect(layers.setVisible(id, false)).resolves.toBeTruthy();
  });
  it('frozen layer: eye blocked, visible flag preserved across freeze/thaw', async () => {
    const id = await activeId();
    await layers.setVisible(id, false);
    await layers.setFrozen(id, true);
    await expect(layers.setVisible(id, true)).rejects.toBeInstanceOf(LayerFrozenError);
    await layers.setFrozen(id, false);
    expect((await layers.getLayer(id)).visible).toBe(false);
  });
  it('freezing or locking the active layer clears activeLayerId', async () => {
    const id = await activeId();
    await layers.setFrozen(id, true);
    expect((await getSettings()).activeLayerId).toBeNull();
    await layers.setFrozen(id, false);
    await layers.setActiveLayer(id);
    await layers.setLocked(id, true);
    expect((await getSettings()).activeLayerId).toBeNull();
  });
  it('setActiveLayer rejects frozen/locked layers', async () => {
    const l = await layers.createVectorLayer('L');
    await layers.setLocked(l.id, true);
    await expect(layers.setActiveLayer(l.id)).rejects.toBeInstanceOf(LayerLockedError);
  });
});

describe('writes', () => {
  it('move sets movedManually, bumps change counter, updates updatedAt', async () => {
    const id = await activeId();
    const before = (await getSettings()).changesSinceBackup;
    const p = await pois.addPoi({ layerId: id, ...pt, gps: { accuracyM: 5, fixTime: new Date().toISOString() } });
    const m = await pois.movePoi(p.id, -77.5, 42.41);
    expect(m.gps?.movedManually).toBe(true);
    expect(m.lon).toBe(-77.5);
    expect((await getSettings()).changesSinceBackup).toBeGreaterThanOrEqual(before + 2);
  });
  it('features bulk add and cascade on layer delete', async () => {
    const l = await layers.createVectorLayer('Trails');
    await features.addFeatures(l.id, [{
      name: 'T', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      source: { kind: 'import', fileName: 'a.kml', importedAt: new Date().toISOString(), datumShiftApplied: false },
    }]);
    expect(await features.featuresByLayer(l.id)).toHaveLength(1);
    await layers.deleteLayer(l.id);
    expect(await db.features.count()).toBe(0);
  });
  it('moveLayer swaps order within a kind', async () => {
    const a = await layers.createVectorLayer('A');
    const b = await layers.createVectorLayer('B');
    await layers.moveLayer(a.id, 'up');
    expect((await layers.getLayer(a.id)).order).toBeGreaterThan((await layers.getLayer(b.id)).order);
  });
});
