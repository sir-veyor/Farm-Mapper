import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createVectorLayer, setLocked } from '../db/layersRepo';
import { ensureSeed } from '../db/seed';
import { getSettings, patchSettings } from '../db/settingsRepo';
import { geometryBounds, metersBetween } from '../util/geo';
import { BUNDLED_VECTORS } from './bundledVectors';
import { seedBundledVectors } from './seedBundledVectors';

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed(); });

const byName = async (n: string) => (await db.layers.toArray()).find((l) => l.name === n)!;

describe('bundled data', () => {
  it('has the expected counts and everything is on the farm (WGS84)', () => {
    const [boundary, trails, stands] = BUNDLED_VECTORS;
    expect(boundary.features).toHaveLength(1);
    expect(trails.features.length).toBeGreaterThan(80);
    expect(stands.stands).toHaveLength(18);
    for (const f of [...boundary.features, ...trails.features]) {
      const b = geometryBounds(f.geometry)!;
      expect(b[0]).toBeGreaterThan(-77.49); expect(b[2]).toBeLessThan(-77.47); expect(b[1]).toBeGreaterThan(42.39); expect(b[3]).toBeLessThan(42.41);
    }
  });
  it('the boundary is a closed outline about 4.6 km around', () => {
    const g = BUNDLED_VECTORS[0].features[0].geometry as GeoJSON.LineString;
    expect(g.coordinates[0]).toEqual(g.coordinates[g.coordinates.length - 1]);
    let len = 0; for (let i = 1; i < g.coordinates.length; i++) len += metersBetween(g.coordinates[i - 1] as [number, number], g.coordinates[i] as [number, number]);
    expect(len).toBeGreaterThan(4400); expect(len).toBeLessThan(4800);
  });
});

describe('seedBundledVectors', () => {
  it('creates Boundary, Trails and Tree Stands layers with their data and default styles', async () => {
    expect(await seedBundledVectors()).toEqual(['Boundary', 'Trails', 'Tree Stands']);
    const [b, t, s] = [await byName('Boundary'), await byName('Trails'), await byName('Tree Stands')];
    expect(await db.features.where('layerId').equals(b.id).count()).toBe(1);
    expect(await db.features.where('layerId').equals(t.id).count()).toBe(BUNDLED_VECTORS[1].features.length);
    expect(await db.pois.where('layerId').equals(s.id).count()).toBe(18);
    expect(s.defaultStyle.symbol).toBe('treestand');
    expect(b.defaultStyle.strokeColor).toBe('#fe00fe');
    expect(b.order).toBeLessThan(t.order); expect(t.order).toBeLessThan(s.order); // stands drawn on top
    expect((await db.pois.where('layerId').equals(s.id).toArray()).every((p) => Object.keys(p.style).length === 0)).toBe(true);
    expect((await getSettings()).activeLayerId).not.toBe(s.id);
  });
  it('runs once per layer: deleted or edited items are not restored', async () => {
    await seedBundledVectors();
    await db.pois.delete((await db.pois.toArray())[0].id);
    await db.features.delete((await db.features.toArray())[0].id);
    expect(await seedBundledVectors()).toEqual([]);
    expect(await db.pois.count()).toBe(17);
  });
  it('adds only layers not yet seeded (e.g. a device that already has the boundary)', async () => {
    await patchSettings({ seededVectors: ['boundary'] });
    expect(await seedBundledVectors()).toEqual(['Trails', 'Tree Stands']);
    expect((await db.layers.toArray()).some((l) => l.name === 'Boundary')).toBe(false);
  });
  it('uses your own editable layer of the same name, but never a locked one', async () => {
    const mine = await createVectorLayer('Trails');
    await seedBundledVectors();
    expect((await db.layers.toArray()).filter((l) => l.name === 'Trails')).toHaveLength(1);
    expect(await db.features.where('layerId').equals(mine.id).count()).toBeGreaterThan(80);
    await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed();
    const locked = await createVectorLayer('Boundary'); await setLocked(locked.id, true);
    await seedBundledVectors();
    expect(await db.features.where('layerId').equals(locked.id).count()).toBe(0);
    expect((await db.layers.toArray()).filter((l) => l.name === 'Boundary')).toHaveLength(2);
  });
});
